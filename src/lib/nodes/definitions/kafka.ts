import type { INodeTypeDescription } from "@/lib/nodes/types";

export const kafka: INodeTypeDescription = {
  name: "n8n-nodes-base.kafka",
  displayName: "Kafka",
  category: "Transform",
  group: ["transform"],
  version: 1,
  description: "Kafka node for OpenFlow implementation",
  defaults: { name: "Kafka" },
  inputs: ["main"],
  outputs: ["main"],
  properties: {
    topic: { type: "string", default: "", description: "Kafka topic to publish to" },
    sendInputData: { type: "boolean", default: true, description: "Whether to send input data" },
    message: { type: "string", default: "", description: "Direct message payload" },
    useSchemaRegistry: { type: "boolean", default: false, description: "Use schema registry" },
    schemaRegistryUrl: { type: "string", default: "", description: "Schema registry URL" },
    eventName: { type: "string", default: "", description: "Schema name in registry" },
    useKey: { type: "boolean", default: false, description: "Attach message key" },
    key: { type: "string", default: "", description: "Message key" },
    headers: { type: "json", default: "", description: "Header key-value pairs" },
    acks: { type: "boolean", default: false, description: "Wait for acknowledgment" },
    compression: { type: "boolean", default: false, description: "Compress messages" },
    timeout: { type: "number", default: 30000, description: "Publish timeout (ms)" },
  },
};