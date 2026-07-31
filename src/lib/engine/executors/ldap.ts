import type { NodeExecutor } from "@/sdk";

export interface LdapEntry {
  dn: string;
  attributes: Record<string, string[]>;
}

export interface LdapClient {
  compare(
    dn: string,
    attributeId: string,
    value: string,
  ): Promise<boolean>;
  create(
    dn: string,
    attributes: Array<{ attributeId: string; value: string }>,
  ): Promise<Record<string, unknown>>;
  delete(dn: string): Promise<void>;
  rename(dn: string, newDn: string): Promise<Record<string, unknown>>;
  search(
    baseDn: string,
    searchFor: string,
    attribute: string,
    searchText: string,
    returnAll: boolean,
    limit: number,
    options: {
      attributeNamesOrIds?: string;
      pageSize?: number;
      scopes?: string;
    },
  ): Promise<LdapEntry[]>;
  update(
    dn: string,
    updateAttributes: string,
    attributes: Array<{ attributeId: string; value: string }>,
  ): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

export type LdapClientFactory = (
  host: string,
  port: number,
  bindDn: string,
  bindPassword: string,
  connectionSecurity: string,
  connectionTimeout?: number,
) => Promise<LdapClient>;

let ldapClientFactory: LdapClientFactory | null = null;

export function setLdapClientFactory(factory: LdapClientFactory | null): void {
  ldapClientFactory = factory;
}

async function resolveClient(
  host: string,
  port: number,
  bindDn: string,
  bindPassword: string,
  connectionSecurity: string,
  connectionTimeout?: number,
): Promise<LdapClient> {
  if (ldapClientFactory) {
    return ldapClientFactory(
      host,
      port,
      bindDn,
      bindPassword,
      connectionSecurity,
      connectionTimeout,
    );
  }
  throw new Error(
    "No LDAP client factory configured. " +
      "Set via setLdapClientFactory() before calling this executor.",
  );
}

interface LdapCredential {
  host: string;
  port: number;
  bindDn: string;
  bindPassword: string;
  connectionSecurity: string;
  connectionTimeout?: number;
}

async function connect(ctx: {
  getCredential(name: string): Promise<unknown>;
}): Promise<LdapClient> {
  const cred = (await ctx.getCredential("ldap")) as LdapCredential | null;
  if (!cred) {
    throw new Error('LDAP credential "ldap" is required');
  }
  return resolveClient(
    cred.host,
    cred.port,
    cred.bindDn,
    cred.bindPassword,
    cred.connectionSecurity,
    cred.connectionTimeout,
  );
}

export const ldapExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  if (inputItems.length === 0) {
    return [[{ json: {} }]];
  }

  const operation = ctx.getParam<string>("operation", "search");
  const client = await connect(ctx);

  try {
    const outputItems = [];

    for (const item of inputItems) {
      try {
        switch (operation) {
          case "compare": {
            const dn = ctx.getParam<string>("dn", "");
            const attributeId = ctx.getParam<string>("attributeId", "");
            const value = ctx.getParam<string>("value", "");
            const result = await client.compare(dn, attributeId, value);
            outputItems.push({
              json: { attributeId, value, result },
              binary: item.binary,
            });
            break;
          }
          case "create": {
            const dn = ctx.getParam<string>("dn", "");
            const attributes = ctx.getParam<
              Array<{ attributeId: string; value: string }>
            >("attributes", []);
            const created = await client.create(dn, attributes);
            outputItems.push({ json: created, binary: item.binary });
            break;
          }
          case "delete": {
            const dn = ctx.getParam<string>("dn", "");
            await client.delete(dn);
            outputItems.push({ json: item.json, binary: item.binary });
            break;
          }
          case "rename": {
            const dn = ctx.getParam<string>("dn", "");
            const newDn = ctx.getParam<string>("newDn", "");
            await client.rename(dn, newDn);
            outputItems.push({
              json: { dn: newDn },
              binary: item.binary,
            });
            break;
          }
          case "search": {
            const baseDn = ctx.getParam<string>("baseDn", "");
            const searchFor = ctx.getParam<string>("searchFor", "");
            const attribute = ctx.getParam<string>("attribute", "");
            const searchText = ctx.getParam<string>("searchText", "");
            const returnAll = ctx.getParam<boolean>("returnAll", true);
            const limit = ctx.getParam<number>("limit", 0);
            const attributeNamesOrIds = ctx.getParam<string>(
              "attributeNamesOrIds",
              "",
            );
            const pageSize = ctx.getParam<number>("pageSize", 0);
            const scopes = ctx.getParam<string>("scopes", "");

            const entries = await client.search(
              baseDn,
              searchFor,
              attribute,
              searchText,
              returnAll,
              limit,
              {
                attributeNamesOrIds:
                  attributeNamesOrIds || undefined,
                pageSize: pageSize || undefined,
                scopes: scopes || undefined,
              },
            );

            for (const entry of entries) {
              outputItems.push({
                json: entry.attributes,
                binary: item.binary,
              });
            }
            break;
          }
          case "update": {
            const dn = ctx.getParam<string>("dn", "");
            const updateAttributes = ctx.getParam<string>(
              "updateAttributes",
              "",
            );
            const attributes = ctx.getParam<
              Array<{ attributeId: string; value: string }>
            >("attributes", []);
            const result = await client.update(
              dn,
              updateAttributes,
              attributes,
            );
            outputItems.push({
              json: result,
              binary: item.binary,
            });
            break;
          }
          default:
            throw new Error(`Unknown LDAP operation: "${operation}"`);
        }
      } catch (err) {
        if (ctx.continueOnFail()) {
          outputItems.push({
            json: {
              error:
                err instanceof Error ? err.message : String(err),
            },
          });
        } else {
          throw err;
        }
      }
    }

    return [outputItems];
  } finally {
    await client.close();
  }
};