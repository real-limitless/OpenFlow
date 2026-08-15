export type AnsibleGalleryEntry = {
  fqcn: string;
  shortName: string;
  collection: string;
  description: string;
};

export type AnsibleOptionSchema = {
  name: string;
  displayName: string;
  type: string;
  required?: boolean;
  default?: unknown;
  description?: string;
  choices?: Array<string | number | boolean> | null;
  noLog?: boolean;
  suboptions?: AnsibleOptionSchema[] | null;
};

export type AnsibleModuleSchema = {
  fqcn: string;
  shortDescription?: string;
  docUrl?: string;
  options: AnsibleOptionSchema[];
};

export const ANSIBLE_NODE_TYPE = "openflow-node-base.ansible";
export const ANSIBLE_TOOL_NODE_TYPE = "openflow-node-base.ansibleTool";
export const ANSIBLE_NODE_TYPES = new Set([ANSIBLE_NODE_TYPE, ANSIBLE_TOOL_NODE_TYPE]);
