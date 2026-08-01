# Factory job — SPEC (clean-room half A)

## Sources
- https://docs.n8n.io/n8n-nodes-base/awsLambda/ (public documentation)
- https://docs.n8n.io/n8n-nodes-base/ (public documentation)
- Temporary corpus at /tmp/openflow-factory-run-20260731-171503/n8n-nodes-base.awsLambda used only to confirm type string

## Wire format
- **Node type**: `n8n-nodes-base.awsLambda`
- **Batch**: `queue`
- **Cycle**: `1` of `4`
- **Input**: JSON object containing a `payload` field
- **Output**: JSON object containing a `result` field

## Parameters
- **Function Name** (string): AWS Lambda function name
- **Region** (string): AWS region
- **Payload** (object): Input data passed to the Lambda function
- **Timeout** (number, optional): Execution timeout in seconds
- **Credentials** (awsLambda.Credentials): AWS credentials object

## Runtime behavior
- Processes incoming items by invoking the configured AWS Lambda function.
- Merges input payload with default parameters before invocation.
- Returns the Lambda function's result as the node's output item.
- Errors transition the node to a failure state with an error description.

## Acceptance tests
1. Invoke the Lambda with a simple payload and verify the output matches the expected transformation.
2. Simulate a timeout and verify the node fails with the appropriate error.
3. Call the node without credentials and verify proper error handling.
4. Execute with a large payload to confirm streaming behavior.
5. Test retry logic on transient errors.

## Gaps / confidence
- Exact schema of payload and result is not fully documented; inferred from publicly available examples.
- Default timeout assumed to be 30 seconds based on typical AWS Lambda defaults.

## OpenFlow mapping
- **Definition group**: `awsLambda`
- **Executor filename**: `src/sdk/awsLambdaExecutor.ts`