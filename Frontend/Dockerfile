# Frontend Dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY Frontend/package.json Frontend/package-lock.json* /app/
RUN npm ci
COPY Frontend/ /app/
ARG VITE_API_BASE=/api
ENV VITE_API_BASE=${VITE_API_BASE}
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Basic nginx config for SPA
RUN printf "server {\n  listen 80;\n  server_name _;\n  root /usr/share/nginx/html;\n  location = / {\n    try_files /index.html =404;\n  }\n  location / {\n    try_files \$uri \$uri/ /index.html;\n  }\n}\n" > /etc/nginx/conf.d/default.conf
EXPOSE 80
