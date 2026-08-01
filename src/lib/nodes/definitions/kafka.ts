import type { INodeTypeDescription } from "@/lib/nodes/types";

export const kafka: INodeTypeDescription = {
  name: "n8n-nodes-base.kafka",
  displayName: "Kafka",
  category: "Transform",
  group: ["transform"],
  version: 1,
  description: "Publish messages to a Kafka topic",
  defaults: { name: "Kafka" },
  inputs: ["main"],
  outputs: ["main"],
  credentials: [{ name: "kafka", required: true }],
  properties: [
    {
      displayName: "Topic",
      name: "topic",
      type: "string",
      default: "",
      required: true,
      description: "Kafka topic to publish to",
    },
    {
      displayName: "Send Input Data",
      name: "sendInputData",
      type: "boolean",
      default: true,
      description: "When true, the incoming item JSON is serialized as the message payload",
    },
    {
      displayName: "Message",
      name: "message",
      type: "string",
      default: "",
      description: "Custom message text payload (used when Send Input Data is false)",
      displayOptions: {
        show: { sendInputData: [false] },
      },
    },
    {
      displayName: "JSON Parameters",
      name: "jsonParameters",
      type: "boolean",
      default: false,
      description: "When true, headers are specified as a raw JSON object",
    },
    {
      displayName: "Use Schema Registry",
      name: "useSchemaRegistry",
      type: "boolean",
      default: false,
      description: "Enable Confluent Schema Registry for Avro serialization",
    },
    {
      displayName: "Schema Registry URL",
      name: "schemaRegistryUrl",
      type: "string",
      default: "",
      description: "URL of the Schema Registry",
      displayOptions: {
        show: { useSchemaRegistry: [true] },
      },
    },
    {
      displayName: "Event Name",
      name: "eventName",
      type: "string",
      default: "",
      description: "Schema name in the Registry (namespace.name)",
      displayOptions: {
        show: { useSchemaRegistry: [true] },
      },
    },
    {
      displayName: "Use Key",
      name: "useKey",
      type: "boolean",
      default: false,
      description: "Whether to attach a partition key",
    },
    {
      displayName: "Key",
      name: "key",
      type: "string",
      default: "",
      description: "Message key value",
      displayOptions: {
        show: { useKey: [true] },
      },
    },
    {
      displayName: "Headers",
      name: "headersUi",
      type: "fixedCollection",
      default: {},
      displayOptions: {
        show: { jsonParameters: [false] },
      },
      options: [
        {
          name: "headerValues",
          displayName: "Header Values",
          values: [
            {
              displayName: "Key",
              name: "key",
              type: "string",
              default: "",
            },
            {
              displayName: "Value",
              name: "value",
              type: "string",
              default: "",
            },
          ],
        },
      ],
    },
    {
      displayName: "Header Parameters (JSON)",
      name: "headerParametersJson",
      type: "json",
      default: "",
      description: "Headers as a flat JSON object",
      displayOptions: {
        show: { jsonParameters: [true] },
      },
    },
    {
      displayName: "Options",
      name: "options",
      type: "collection",
      default: {},
      options: [
        {
          displayName: "Acks",
          name: "acks",
          type: "boolean",
          default: false,
          description: "Wait for acknowledgment from all in-sync replicas",
        },
        {
          displayName: "Compression",
          name: "compression",
          type: "boolean",
          default: false,
          description: "Enable GZIP compression for the message",
        },
        {
          displayName: "Timeout",
          name: "timeout",
          type: "number",
          default: 30000,
          description: "Time to wait for a broker response in milliseconds",
        },
      ],
    },
  ],
};
