import type { INodeProperties, INodeTypeDescription } from "../types";

const ansibleProperties: INodeProperties[] = [
  {
    displayName:
      "Run an Ansible module or playbook on the worker. Bind Ansible SSH credentials for remote hosts and become. Free-form modules (command/shell/raw/script) are blocked. Playbooks must be .yml/.yaml under allowlisted roots.",
    name: "notice",
    type: "notice",
    default: "",
  },
  {
    displayName: "Resource",
    name: "resource",
    type: "options",
    default: "module",
    options: [
      { name: "Module (ad-hoc)", value: "module" },
      { name: "Playbook", value: "playbook" },
    ],
    description: "Ad-hoc module run vs ansible-playbook",
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
    displayOptions: { show: { resource: ["module"] } },
  },
  {
    displayName: "Arguments",
    name: "args",
    type: "json",
    default: {},
    description: "Module arguments as a JSON object (YAML map equivalent)",
    typeOptions: { rows: 8 },
    displayOptions: { show: { resource: ["module"] } },
  },
  {
    displayName: "Playbook Path",
    name: "playbook",
    type: "string",
    default: "",
    required: true,
    description:
      "Absolute or cwd-relative path to a .yml/.yaml playbook on the worker (must be under allowlisted roots)",
    placeholder: "/data/ansible/playbooks/site.yml",
    displayOptions: { show: { resource: ["playbook"] } },
  },
  {
    displayName: "Extra Vars",
    name: "extraVars",
    type: "json",
    default: {},
    description: "Extra variables passed as -e @file.json",
    typeOptions: { rows: 6 },
    displayOptions: { show: { resource: ["playbook"] } },
  },
  {
    displayName: "Limit",
    name: "limit",
    type: "string",
    default: "",
    description: "ansible-playbook --limit host pattern",
    displayOptions: { show: { resource: ["playbook"] } },
  },
  {
    displayName: "Tags",
    name: "tags",
    type: "string",
    default: "",
    description: "Comma-separated --tags",
    displayOptions: { show: { resource: ["playbook"] } },
  },
  {
    displayName: "Skip Tags",
    name: "skipTags",
    type: "string",
    default: "",
    description: "Comma-separated --skip-tags",
    displayOptions: { show: { resource: ["playbook"] } },
  },
  {
    displayName: "Hosts",
    name: "hosts",
    type: "string",
    default: "localhost",
    description: "Host pattern for ad-hoc ansible (module mode)",
    displayOptions: { show: { resource: ["module"] } },
  },
  {
    displayName: "Inventory",
    name: "inventory",
    type: "string",
    default: "",
    description: "Inventory file path or inline list. Empty uses defaults / credential inventory",
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
    typeOptions: { minValue: 5, maxValue: 7200 },
    description: "Subprocess timeout (playbooks default higher in executor if needed)",
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
    "Run an Ansible module or playbook on the worker (local ansible CLI). Prefer check mode before applying changes.",
  defaults: { name: "Ansible" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Server",
  credentials: ansibleCredentials,
  sources: [
    "https://docs.ansible.com/ansible/latest/command_guide/intro_adhoc.html",
    "https://docs.ansible.com/ansible/latest/cli/ansible-playbook.html",
    "https://github.com/real-limitless/ansible-flow-mcp",
  ],
  properties: ansibleProperties.map((p) =>
    p.name === "checkMode"
      ? { ...p, default: false }
      : p.name === "timeout"
        ? { ...p, default: 120 }
        : p,
  ),
};

export const ansibleTool: INodeTypeDescription = {
  name: "openflow-node-base.ansibleTool",
  displayName: "Ansible (AI Tool)",
  category: "AI Tool",
  group: ["organization"],
  version: 1,
  description:
    "Run an Ansible module or playbook as an AI agent tool. Prefer check mode; free-form command/shell modules are blocked.",
  defaults: { name: "Ansible Tool" },
  inputs: ["main"],
  outputs: ["main"],
  icon: "Server",
  credentials: ansibleCredentials,
  sources: [
    "https://docs.ansible.com/ansible/latest/command_guide/intro_adhoc.html",
    "https://docs.ansible.com/ansible/latest/cli/ansible-playbook.html",
    "https://github.com/real-limitless/ansible-flow-mcp",
  ],
  properties: ansibleProperties.map((p) => (p.name === "timeout" ? { ...p, default: 300 } : p)),
};
