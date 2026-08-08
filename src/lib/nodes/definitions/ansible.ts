import type { INodeProperties, INodeTypeDescription } from "../types";

const ansibleProperties: INodeProperties[] = [
  {
    displayName:
      "Runs ad-hoc ansible on the OpenFlow worker. Bind Ansible SSH credentials for remote hosts and become. Free-form modules (command/shell/raw/script) are blocked. Module options use Form when a schema exists, otherwise JSON.",
    name: "notice",
    type: "notice",
    default: "",
  },
  {
    displayName: "Authentication",
    name: "authentication",
    type: "options",
    default: "none",
    description:
      "none = local/control-node defaults; ansibleSsh = dedicated credential; or reuse SSH password/key credentials",
    options: [
      { name: "None (local / inventory only)", value: "none" },
      { name: "Ansible SSH credential", value: "ansibleSsh" },
      { name: "SSH Password credential", value: "sshPassword" },
      { name: "SSH Private Key credential", value: "sshPrivateKey" },
    ],
  },
  {
    displayName: "Module",
    name: "module",
    type: "string",
    default: "ansible.builtin.ping",
    required: true,
    description: "Fully-qualified module name, e.g. ansible.builtin.file",
    placeholder: "ansible.builtin.file",
  },
  {
    displayName: "Arguments",
    name: "args",
    type: "json",
    default: {},
    description: "Module arguments as a JSON object (YAML map equivalent)",
    typeOptions: { rows: 8 },
  },
  {
    displayName: "Hosts",
    name: "hosts",
    type: "string",
    default: "localhost",
    description: "Host pattern passed to ansible",
  },
  {
    displayName: "Inventory",
    name: "inventory",
    type: "string",
    default: "",
    description: "Inventory file path or inline list. Empty uses inline hosts,",
  },
  {
    displayName: "Check Mode",
    name: "checkMode",
    type: "boolean",
    default: true,
    description: "Pass --check (dry run where supported). Prefer true for AI tool use.",
  },
  {
    displayName: "Become",
    name: "become",
    type: "boolean",
    default: false,
    description: "Pass --become",
  },
  {
    displayName: "Become User",
    name: "becomeUser",
    type: "string",
    default: "",
    description: "Pass --become-user when set",
    displayOptions: { show: { become: [true] } },
  },
  {
    displayName: "Connection",
    name: "connection",
    type: "string",
    default: "",
    description: "Ansible connection plugin (-c). Empty defaults local for localhost",
    placeholder: "local",
  },
  {
    displayName: "Timeout (seconds)",
    name: "timeout",
    type: "number",
    default: 120,
    typeOptions: { minValue: 5, maxValue: 3600 },
    description: "Subprocess timeout",
  },
  {
    displayName: "Execute Once",
    name: "executeOnce",
    type: "boolean",
    default: true,
    description:
      "When true, run once using the first item for expressions. When false, run per input item.",
  },
];

const ansibleCredentials = [
  { name: "ansibleSsh", required: false },
  { name: "sshPassword", required: false },
  { name: "sshPrivateKey", required: false },
];

export const ansible: INodeTypeDescription = {
  name: "openflow-node-base.ansible",
  displayName: "Ansible",
  category: "Development",
  group: ["organization"],
  version: 1,
  description:
    "Run an Ansible module on the worker (local ansible CLI). Pass module FQCN and JSON args; prefer check mode before applying changes.",
  defaults: { name: "Ansible" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Server",
  credentials: ansibleCredentials,
  sources: [
    "https://docs.ansible.com/ansible/latest/command_guide/intro_adhoc.html",
    "https://github.com/real-limitless/ansible-flow-mcp",
  ],
  properties: ansibleProperties.map((p) => (p.name === "checkMode" ? { ...p, default: false } : p)),
};

export const ansibleTool: INodeTypeDescription = {
  name: "openflow-node-base.ansibleTool",
  displayName: "Ansible (AI Tool)",
  category: "AI Tool",
  group: ["organization"],
  version: 1,
  description:
    "Run an Ansible module as an AI agent tool (local ansible CLI). Prefer check mode; free-form command/shell modules are blocked.",
  defaults: { name: "Ansible Tool" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Server",
  credentials: ansibleCredentials,
  sources: [
    "https://docs.ansible.com/ansible/latest/command_guide/intro_adhoc.html",
    "https://github.com/real-limitless/ansible-flow-mcp",
  ],
  properties: ansibleProperties,
};
