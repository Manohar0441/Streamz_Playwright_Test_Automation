# ============================================================================
# jenkins/Dockerfile — Jenkins controller with a Docker CLI
# ----------------------------------------------------------------------------
# The pipeline runs `docker build/run/...`, so the Jenkins container needs the
# Docker *client*. It talks to your host's Docker daemon through the socket that
# docker-compose mounts in (/var/run/docker.sock). This is for LOCAL practice.
# ============================================================================
FROM jenkins/jenkins:lts-jdk17

USER root

# Install the Docker CLI (client only) from Docker's official apt repo.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg bash \
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
 && chmod a+r /etc/apt/keyrings/docker.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" \
      > /etc/apt/sources.list.d/docker.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends docker-ce-cli \
 && rm -rf /var/lib/apt/lists/*

# Pre-install the plugins the pipeline needs (skips the manual plugin wizard).
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt

# Skip the setup wizard so the controller comes up ready to use.
ENV JAVA_OPTS="-Djenkins.install.runSetupWizard=false"

USER jenkins
