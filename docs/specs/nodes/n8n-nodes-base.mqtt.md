# n8n-nodes-base.mqtt Specification

## Sources
- https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mqtt.md (Public docs only)
- https://docs.n8n.io/integrations/builtin/credentials/mqtt.md (Public docs only)

## Wire format
- **Type string**: `n8n-nodes-base.mqtt`
- **Inputs**: 1 (message input)
- **Outputs**: 1 (MQTT message output)
- **Credentials**: `mqtt` (see External API Requirements)

## External API / Service Requirements
- The node must connect to an MQTT broker using a protocol (`mqtt`, `mqtts`, or `ws`) provided by the user.
- Required broker endpoint details: `host`, `port`.
- Authentication: optional `username` and `password`.
- Optional `clean session` flag.
- Optional `client id` (defaults to generated ID).
- Optional SSL configuration: `ssl` toggle, client certificate, client key, CA certificates.
- These parameters define the service contract; they must be satisfied for successful connectivity.

## Node Configuration Parameters
- **Topic** (string): Destination topic for the MQTT message.
- **Payload** (any): Message payload; can be static, templated, or derived from input data.
- **Qos** (integer, optional): Quality of Service level; defaults to 0.
- **Retain** (boolean, optional): Whether the message should be retained by the broker.
- **Protocol** (string, optional): Alias for credential protocol; inherited from credentials but can be overridden at node level.
- **Additional templating options** (abstract: allow expression of topic and payload using n8n expressions).

These parameters are high‑level; exact internal nesting is abstracted away.

## Runtime Behavior
- When an execution arrives, the node reads the configured credentials and establishes a connection to the MQTT broker.
- It publishes a message to the specified `topic` with the `payload` (and optionally `qos` and `retain` flags) using the provided `protocol`.
- If `msg.topic` or `msg.payload` templating is used, the node evaluates the expressions against the incoming workflow data.
- Successful publication results in an output message containing the response status (often an acknowledgment) preserving the original input payload.
- Errors during connection or publish are propagated as standard n8n execution errors, causing the workflow to stop or move to error handling branches.

## Acceptance Tests
1. **Basic Publish Test**: Configure topic `"test/topic"` and payload `"Hello"`; trigger the node; verify output message payload is exactly `"Hello"` and that the node’s metadata indicates a successful publish.
2. **Templated Topic Test**: Set topic to `{{ $json["topic"] }}` and provide input `{"topic":"demo"}`; verify outgoing message is sent to topic `"demo"`.
3. **Credential SSL Test**: Enable SSL and provide a dummy client certificate; verify the node can establish a TLS connection (no runtime broker required for test harness).
4. **QoS and Retain Test**: Publish with `qos: 1` and `retain: true`; verify the output reflects those settings in the message metadata.
5. **Error Path Test**: Provide an invalid host; verify the node fails with an appropriate execution error.

## Gaps / Confidence
- Exact QoS enumeration and default values are not fully detailed in public docs; inferred from MQTT spec.
- SSL certificate handling details are described but specifics about key formats are not; assumed to follow standard TLS practices.
- Some advanced broker options (e.g., keep‑alive intervals) are not exposed at the node configuration level and are thus out of scope.

## OpenFlow Mapping
- **Definition group**: `mqtt`
- **Executor filename**: `mqttExecutor.js`