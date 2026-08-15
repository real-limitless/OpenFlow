import type { INodeTypeDescription } from "@/lib/nodes/types";

export const mqtt: INodeTypeDescription = {
  name: "openflow-node-base.mqtt",
  displayName: "MQTT",
  category: "Communication",
  group: ["communication"],
  version: 1,
  description: "Publishes messages to an MQTT broker",
  defaults: { name: "MQTT" },
  inputs: ["main"],
  outputs: ["main"],
  credentials: [{ name: "mqtt", required: true }],
  properties: [
    {
      displayName: "Topic",
      name: "topic",
      type: "string",
      default: "",
      required: true,
      description: "MQTT topic to publish to",
    },
    {
      displayName: "Send Input Data",
      name: "sendInputData",
      type: "boolean",
      default: true,
      description: "When true, serializes incoming JSON as the message payload",
    },
    {
      displayName: "Message",
      name: "message",
      type: "string",
      default: "",
      description: "Custom message text; required when Send Input Data is false",
    },
    {
      displayName: "Options",
      name: "options",
      type: "collection",
      default: {},
      options: [
        {
          displayName: "QoS",
          name: "qos",
          type: "number",
          default: 0,
          description: "Quality of Service: 0 (at most once), 1 (at least once), 2 (exactly once)",
        },
        {
          displayName: "Retain",
          name: "retain",
          type: "boolean",
          default: false,
          description: "Whether the broker retains the last message on this topic",
        },
      ],
    },
  ],
};
