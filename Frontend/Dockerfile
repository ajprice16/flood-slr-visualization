# Frontend Dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY Frontend/package.json Frontend/package-lock.json* /app/
RUN npm ci
COPY Frontend/ /app/
ARG VITE_API_BASE=/api
ENV VITE_API_BASE=${VITE_API_BASE}
RUN npm run build

FROM nginxinc/nginx-unprivileged:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY Frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
