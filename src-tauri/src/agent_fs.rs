//! File access for the model — restricted to the granted workspace.
//!
//! idea.md §22 and §92 are explicit: the model gets no host shell, and its file
//! tools only operate inside the workspace it was granted. The Agent Runner
//! enforces that (agent-runner/src/native-tools), but the webview keeps its own
//! agent path for when the runner is down and for providers that bypass it — and
//! that path had no containment at all, plus a tool that ran `sh -c <anything>`.
//!
//! Containment belongs here rather than in the caller: the webview is the side
//! being restricted, so it cannot be the side enforcing the restriction. The
//! app's own file commands (`read_host_file` and friends) stay unrestricted —
//! they serve the UI, not the model.

use std::path::{Component, Path, PathBuf};

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

const ACCESS_DENIED: &str =
    "Access denied: agent file tools are restricted to the assigned workspace";

/// Collapse `.` and `..` textually.
///
/// Required for the part of a path that does not exist yet: `canonicalize`
/// cannot resolve it, and `Path::starts_with` compares components literally, so
/// `<root>/notes/../../secrets.txt` would otherwise pass the containment check.
fn lexical_normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Resolve symlinks as far as the path exists, keeping the missing tail.
///
/// A file being written does not exist yet, so `canonicalize` alone cannot be
/// used; but both sides of the comparison must be real paths, because macOS
/// makes `/var` and `/tmp` symlinks and a lexical check would reject the
/// workspace itself.
fn realpath_best_effort(target: &Path) -> PathBuf {
    let mut pending: Vec<PathBuf> = Vec::new();
    let mut current = target.to_path_buf();
    loop {
        if let Ok(real) = current.canonicalize() {
            let mut out = real;
            for part in pending.iter().rev() {
                out.push(part);
            }
            return lexical_normalize(&out);
        }
        let Some(parent) = current.parent().map(Path::to_path_buf) else {
            return lexical_normalize(target);
        };
        if parent == current {
            return lexical_normalize(target);
        }
        if let Some(name) = current.file_name() {
            pending.push(PathBuf::from(name));
        }
        current = parent;
    }
}

/// Map a model-supplied path into the workspace, refusing anything outside it.
///
/// Absolute paths and `..` are both rejected — an absolute path used to be
/// returned untouched, which is how `~/Desktop/output.txt` reached the disk.
pub fn workspace_path(workspace: &Path, input: &str) -> Result<PathBuf, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("path is required".to_string());
    }
    std::fs::create_dir_all(workspace).map_err(err)?;
    let root = realpath_best_effort(workspace);

    // `join` lets an absolute input replace the root, exactly as the runner's
    // `path.resolve` does — so absolute paths, `..` and symlinks all end up
    // judged by the same containment check rather than by three special cases.
    // An absolute path that genuinely points inside the workspace still works,
    // which is what lets the model reuse a path a previous write returned.
    //
    // `..` must be collapsed here, before resolving: walking up to an existing
    // ancestor drops `..` components (`file_name()` is None for them), which
    // silently rewrote `notes/../../secrets.txt` into `notes/secrets.txt` —
    // contained, but not the path anyone asked for.
    let real = realpath_best_effort(&lexical_normalize(&root.join(trimmed)));
    if !real.starts_with(&root) {
        return Err(ACCESS_DENIED.to_string());
    }
    Ok(real)
}

fn readable_path(workspace: &Path, approved_roots: &[String], input: &str) -> Result<PathBuf, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("path is required".to_string());
    }
    // Chuẩn hóa target path
    let target_normalized = realpath_best_effort(&lexical_normalize(&realpath_best_effort(workspace).join(trimmed)));

    let mut all_roots_normalized = vec![realpath_best_effort(workspace)];

    // Chuẩn hóa tất cả approved_roots bằng realpath_best_effort và lexical_normalize
    for root_str in approved_roots {
        let root_path = PathBuf::from(root_str);
        all_roots_normalized.push(realpath_best_effort(&lexical_normalize(&root_path)));
    }

    // Kiểm tra xem target_normalized có bắt đầu bằng bất kỳ root nào đã được chuẩn hóa không
    if all_roots_normalized.iter().any(|root| target_normalized.starts_with(root)) {
        return Ok(target_normalized);
    }

    Err(format!("{ACCESS_DENIED}. PERMISSION_REQUEST: {}", target_normalized.to_string_lossy()))
}

pub fn read(workspace: &Path, approved_roots: &[String], path: &str) -> Result<String, String> {
    std::fs::read_to_string(readable_path(workspace, approved_roots, path)?).map_err(err)
}

pub fn write(workspace: &Path, path: &str, content: &str) -> Result<String, String> {
    let target = workspace_path(workspace, path)?;
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(err)?;
    }
    std::fs::write(&target, content).map_err(err)?;
    Ok(target.to_string_lossy().to_string())
}

pub fn list(workspace: &Path, approved_roots: &[String], path: &str) -> Result<Vec<String>, String> {
    let target = readable_path(workspace, approved_roots, if path.trim().is_empty() { "." } else { path })?;
    let mut names: Vec<String> = std::fs::read_dir(target)
        .map_err(err)?
        .filter_map(|entry| entry.ok())
        .map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            if entry.path().is_dir() {
                format!("{name}/")
            } else {
                name
            }
        })
        .collect();
    names.sort();
    Ok(names)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn workspace() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("vua-agent-fs-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn relative_paths_stay_inside() {
        let ws = workspace();
        let p = workspace_path(&ws, "notes/today.md").unwrap();
        assert!(p.starts_with(realpath_best_effort(&ws)));
    }

    #[test]
    fn absolute_paths_outside_are_refused() {
        let ws = workspace();
        assert!(workspace_path(&ws, "/etc/passwd").is_err());
    }

    #[test]
    fn parent_traversal_is_refused() {
        let ws = workspace();
        assert!(workspace_path(&ws, "../../../../etc/passwd").is_err());
        assert!(workspace_path(&ws, "notes/../../secrets.txt").is_err());
    }

    #[test]
    fn an_absolute_path_inside_the_workspace_still_works() {
        let ws = workspace();
        let inside = realpath_best_effort(&ws).join("notes/today.md");
        let p = workspace_path(&ws, inside.to_str().unwrap()).unwrap();
        assert_eq!(p, inside);
    }

    #[test]
    fn reads_outside_the_workspace_are_refused() {
        let ws = workspace();
        assert!(read(&ws, &[], "/etc/hosts").is_err());
        assert!(write(&ws, "../escaped.txt", "x").is_err());
    }

    #[test]
    fn approved_folders_are_readable_but_not_writable() {
        let ws = workspace();
        let approved = ws.parent().unwrap().join(format!("vua-approved-{}", std::process::id()));
        std::fs::create_dir_all(&approved).unwrap();
        std::fs::write(approved.join("note.txt"), "approved content").unwrap();
        let grants = vec![approved.to_string_lossy().to_string()];
        assert_eq!(read(&ws, &grants, approved.join("note.txt").to_str().unwrap()).unwrap(), "approved content");
        assert!(write(&ws, approved.join("blocked.txt").to_str().unwrap(), "nope").is_err());
    }

    #[test]
    fn approved_folder_match_is_component_bound() {
        let ws = workspace();
        let base = ws.parent().unwrap().join(format!("vua-approved-bound-{}", std::process::id()));
        let sibling = ws.parent().unwrap().join(format!("vua-approved-bound-{}-sibling", std::process::id()));
        std::fs::create_dir_all(&base).unwrap();
        std::fs::create_dir_all(&sibling).unwrap();
        std::fs::write(sibling.join("secret.txt"), "nope").unwrap();
        let grants = vec![base.to_string_lossy().to_string()];
        assert!(read(&ws, &grants, sibling.join("secret.txt").to_str().unwrap()).is_err());
    }

    #[test]
    fn writes_land_in_the_workspace() {
        let ws = workspace();
        let written = write(&ws, "sub/dir/file.txt", "hello").unwrap();
        assert!(PathBuf::from(&written).starts_with(realpath_best_effort(&ws)));
        assert_eq!(read(&ws, &[], "sub/dir/file.txt").unwrap(), "hello");
    }
}
