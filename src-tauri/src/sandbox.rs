//! WASM sandbox — the isolation primitive for the agent runtime.
//!
//! Agent-run code executes inside a WebAssembly guest via Wasmtime. A guest
//! gets **no host imports** (it cannot reach the filesystem, network, or
//! processes unless a capability is explicitly granted later), a hard memory
//! ceiling, and a fuel budget — so a runaway or hostile guest is trapped
//! rather than hanging or harming the host machine. Every sandboxed agent
//! worker is built on top of this.

use wasmtime::{Config, Engine, Instance, Module, Store, StoreLimitsBuilder};

pub struct SandboxOutcome {
    /// The i64 the guest's `run` export returned, if it completed.
    pub value: Option<i64>,
    /// True when the guest was stopped (fuel/memory/trap/denied) instead of
    /// finishing normally.
    pub trapped: bool,
    pub message: String,
}

/// Run a compute-only module's `run() -> i64` export under strict caps.
///
/// `wasm` may be binary or WAT text. `fuel` bounds execution steps; `max_memory`
/// bounds guest linear memory. The module is instantiated with **zero imports**,
/// so it has no way to call into the host.
pub fn run_capped(wasm: &str, fuel: u64, max_memory: usize) -> Result<SandboxOutcome, String> {
    let mut config = Config::new();
    config.consume_fuel(true);
    let engine = Engine::new(&config).map_err(err)?;
    let module = Module::new(&engine, wasm).map_err(err)?;

    // A sandboxed guest may not import anything: reject up front with a clear
    // message rather than a generic instantiation error.
    let import_count = module.imports().len();
    if import_count > 0 {
        return Ok(SandboxOutcome {
            value: None,
            trapped: true,
            message: format!("denied: guest requested {import_count} host import(s)"),
        });
    }

    let limits = StoreLimitsBuilder::new().memory_size(max_memory).build();
    let mut store = Store::new(&engine, limits);
    store.limiter(|l| l);
    store.set_fuel(fuel).map_err(err)?;

    let instance = Instance::new(&mut store, &module, &[]).map_err(err)?;
    let run = instance
        .get_typed_func::<(), i64>(&mut store, "run")
        .map_err(err)?;

    match run.call(&mut store, ()) {
        Ok(value) => Ok(SandboxOutcome {
            value: Some(value),
            trapped: false,
            message: "ok".into(),
        }),
        Err(trap) => Ok(SandboxOutcome {
            value: None,
            trapped: true,
            message: trap.to_string(),
        }),
    }
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}
