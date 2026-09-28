FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# API URL is baked into the bundle at build time (Vite inlines VITE_* envs).
# Defaults to the backend's published host port (:8080); override per env.
ARG VITE_API_URL=http://localhost:8080/api/v1
ENV VITE_API_URL=$VITE_API_URL

# Environment label shown in the UI ("local" when unset).
ARG VITE_ENV=local
ENV VITE_ENV=$VITE_ENV

# Firebase web config. These values are public by design — they identify the
# project, they do not authorize anything. Access control is enforced
# server-side by verifying the ID token and requiring an invitation. Leaving
# them empty disables the "Entrar com Google" button.
ARG VITE_FIREBASE_API_KEY=
ARG VITE_FIREBASE_AUTH_DOMAIN=
ARG VITE_FIREBASE_PROJECT_ID=
ARG VITE_FIREBASE_APP_ID=
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID

RUN npm run build

# Unprivileged variant: runs as the nginx user (uid 101) with its pid and temp
# dirs under /tmp. The stock nginx image starts as root and chowns
# /var/cache/nginx/*, which fails under the compose's `cap_drop: ALL`.
FROM nginxinc/nginx-unprivileged:1.27.5-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Listens on 8080 rather than :80 so the container can run unprivileged behind
# the EasyPanel proxy; binding :80 would require CAP_NET_BIND_SERVICE.
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
