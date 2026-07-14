FROM nginx:alpine

# Copy pre-built React app
COPY build /usr/share/nginx/html

# Copy custom nginx config with API proxying
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
