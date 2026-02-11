# Use a small nginx image to serve the static site
FROM nginx:stable-alpine

LABEL maintainer="Math Fact Invaders <xwilt47@gmail.com>"

# Copy a custom nginx config to make mathdex.html the default index
COPY default.conf /etc/nginx/conf.d/default.conf

# Copy site files into nginx html directory
COPY . /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
