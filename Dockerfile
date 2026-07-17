# V Assistant — production web build served by nginx.
#
# This is the real build (not the demo): direct sign-in with OpenRouter
# works because the app runs at http://localhost:<port>, a valid OAuth
# callback. Credentials live in the browser's localStorage (the desktop
# app uses the OS keychain instead).

# --- Build stage ---
FROM node:24-alpine AS build
WORKDIR /app
# Use npm install (not ci) so a slightly out-of-sync lockfile still builds.
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
# Runs validate-skills + tsc + vite build → /app/dist
RUN npm run build

# --- Serve stage ---
FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
