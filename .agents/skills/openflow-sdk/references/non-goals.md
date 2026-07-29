# OpenFlow SDK — explicit non-goals

These are **out of scope** for the OpenFlow Plugin SDK and product runtime.

## Do not

1. **Load or execute third-party `n8n-nodes-*` packages**  
   Users must not `require()` / dynamic-import community or core node packages
   from another vendor inside OpenFlow. Extensibility is **OpenFlow plugins**
   written against this SDK only.

2. **Vendor or depend on `n8n-workflow`, n8n core, or n8n EE packages**  
   No npm dependency, submodule, or copied runtime from those trees.

3. **Claim “runs any n8n community node” or “n8n SDK compatible”**  
   Marketing and UI must not imply affiliation or drop-in package compatibility.

4. **Clone a full third-party execute-API surface**  
   Familiar aliases stay thin. Do not expand aliases into a line-by-line mirror
   of another product’s helper catalog.

5. **Read third-party source when implementing nodes or the SDK**  
   Permitted inputs: public documentation, public workflow JSON exports,
   observed behavior of a public instance, OpenFlow specs under `docs/specs/`,
   and this repository.

6. **Multi-tenant execution of untrusted user plugin code** (future)  
   If user plugins are added later, start self-hosted / trusted-operator only
   unless a hardened isolation design exists.

## Do

- Reimplement high-value nodes as **native** OpenFlow definitions + executors.
- Import workflow JSON; unknown types remain **placeholders** (no execute).
- Publish (later) an OpenFlow plugin format that uses `defineNode` only.
- Keep wire type strings for lossless JSON round-trip when needed.
