{{- define "openflow.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "openflow.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "openflow.labels" -}}
app.kubernetes.io/name: {{ include "openflow.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "openflow.databaseUrl" -}}
{{- if .Values.postgres.enabled -}}
postgresql://{{ .Values.postgres.user }}:{{ .Values.secrets.postgresPassword }}@{{ include "openflow.fullname" . }}-postgres:5432/{{ .Values.postgres.database }}
{{- else -}}
{{ required "external DATABASE_URL required when postgres.enabled=false" .Values.externalDatabaseUrl }}
{{- end -}}
{{- end -}}

{{- define "openflow.redisUrl" -}}
{{- if .Values.redis.enabled -}}
redis://{{ include "openflow.fullname" . }}-redis:6379
{{- else -}}
{{ required "external REDIS_URL required when redis.enabled=false" .Values.externalRedisUrl }}
{{- end -}}
{{- end -}}
