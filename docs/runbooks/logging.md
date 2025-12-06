# Logging Runbook

#### I created a new container, but don't see logs in grafana.

1. Ensure the environment variable `FLUENTD_ADDRESS` is set
2. Ensure the setting 'Drain logs' is enabled in 'Configuration' -> 'Advanced'
3. Ensure logs properly set the `service` key for targeting
