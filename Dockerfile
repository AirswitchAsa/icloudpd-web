FROM python:3.12.8-slim

# Set working directory
WORKDIR /app

# Install your package
RUN pip install --no-cache-dir icloudpd-web

# Create an entrypoint script and set permissions (do this BEFORE switching users)
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create a non-root user and switch to it (do this AFTER chmod)
RUN useradd -m appuser
USER appuser

# Create necessary directories
RUN mkdir -p /home/appuser/.icloudpd_web

# Expose the default port
EXPOSE 5000

# Set environment variables (these can be overridden)
ENV HOST=0.0.0.0
ENV PORT=5000

ENTRYPOINT ["docker-entrypoint.sh"]
