
pipeline {
  agent any

  options {
    disableConcurrentBuilds()
  }

  triggers {
    githubPush()
    pollSCM('H/2 * * * *')   // every ~2 minutes; remove if you wire up the webhook
  }

  environment {
    IMAGE        = 'streamz'
    TEST_IMAGE   = 'streamz-tests'
    TAG          = "build-${env.BUILD_NUMBER}"
    CONTAINER    = 'streamz'
    PORT         = '3001'   // host port for the deployed app (3000 is taken by a local dev server)
    E2E_APP      = 'streamz-e2e'
    E2E_NET      = 'streamz-e2e-net'
    TEST_RUNNER  = "streamz-tests-${env.BUILD_NUMBER}"
  }

  stages {

    /* 1) BUILD — turn the pushed source into a versioned Docker image. ------ */
    stage('Build') {
      steps {
        sh 'docker build -t $IMAGE:$TAG .'
      }
    }

    /* 2) TEST — ALL levels (unit/api/integration/smoke/e2e) run on the Playwright
            runner, inside a purpose-built test image, against the app running in
            its own container. We do NOT bind-mount the workspace (unreliable when
            Jenkins is itself a container); instead we `docker cp` the artifacts
            out of the test container afterwards. */
    stage('Test (Playwright: unit/api/integration/smoke/e2e)') {
      steps {
        sh '''
          set -e
          docker rm -f $E2E_APP $TEST_RUNNER >/dev/null 2>&1 || true
          docker network create $E2E_NET >/dev/null 2>&1 || true

          # Build the test image (Playwright browsers + our specs baked in).
          docker build -f Dockerfile.test -t $TEST_IMAGE:$TAG .

          # Start the app under test on a private network.
          docker run -d --name $E2E_APP --network $E2E_NET $IMAGE:$TAG

          set +e
          docker run --name $TEST_RUNNER --network $E2E_NET \
            -e BASE_URL=http://$E2E_APP:3000 -e CI=true \
            $TEST_IMAGE:$TAG
          TEST_EXIT=$?
          exit $TEST_EXIT
        '''
      }
      post {
        always {
          sh '''
            docker rm -f $TEST_RUNNER >/dev/null 2>&1 || true
            docker rm -f $E2E_APP >/dev/null 2>&1 || true
            docker network rm $E2E_NET >/dev/null 2>&1 || true
          '''
          // Archive the HTML report AND the raw artifacts (traces, videos, screenshots).
          archiveArtifacts artifacts: 'playwright-report/**, test-results/**', allowEmptyArchive: true
        }
      }
    }

    /* 3) EXECUTE (deploy) — run the tested image as the live container.
          deploy.sh saves the current image as streamz:previous first, then
          health-checks the new one. */
    stage('Deploy (Execute)') {
      steps {
        sh 'PORT=$PORT CONTAINER=$CONTAINER bash scripts/deploy.sh $IMAGE:$TAG'
      }
      post {
        success {
          // Promote this image as the known-good baseline for the next run.
          sh 'docker tag $IMAGE:$TAG $IMAGE:current'
          echo "Deployed ${IMAGE}:${TAG} successfully."
        }
        failure {
          echo 'Deploy/health-check failed — rolling back to the previous deployment.'
          sh 'PORT=$PORT CONTAINER=$CONTAINER bash scripts/rollback.sh'
        }
      }
    }
  }

  post {
    failure {
      echo 'Pipeline failed. A failure BEFORE the deploy stage leaves the ' +
           'currently-running (previous) deployment untouched; a failure ' +
           'DURING deploy triggers an automatic rollback (see the Deploy stage).'
    }
    always {
      // Tidy dangling images so the agent disk does not fill up over time.
      sh 'docker image prune -f >/dev/null 2>&1 || true'
    }
  }
}
