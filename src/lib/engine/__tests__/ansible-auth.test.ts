import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { prepareAnsibleAuth } from "../executors/ansible-auth";

describe("prepareAnsibleAuth", () => {
  it("returns null without credential", async () => {
    expect(await prepareAnsibleAuth({ credential: null })).toBeNull();
  });

  it("writes inventory + key file and cleans up", async () => {
    const prep = await prepareAnsibleAuth({
      credential: {
        host: "10.0.0.5",
        username: "ops",
        privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nfake\n-----END OPENSSH PRIVATE KEY-----",
        becomePassword: "s3cret",
        becomeUser: "root",
      },
      hostsParam: "web",
      becomeParam: true,
    });
    expect(prep).not.toBeNull();
    expect(prep!.hostPattern).toBe("web");
    expect(prep!.become).toBe(true);
    expect(prep!.debug.hasPrivateKey).toBe(true);
    expect(prep!.debug.hasBecomePassword).toBe(true);
    expect(prep!.connection).toBe("ssh");

    const inv = await readFile(prep!.inventoryPath, "utf8");
    expect(inv).toContain("ansible_host=10.0.0.5");
    expect(inv).toContain("ansible_user=ops");
    expect(inv).toContain("ansible_become=true");
    expect(inv).toContain("ansible_become_password=s3cret");
    expect(inv).toMatch(/ansible_ssh_private_key_file=/);

    await prep!.cleanup();
    await expect(readFile(prep!.inventoryPath, "utf8")).rejects.toThrow();
  });

  it("password auth sets ansible_password", async () => {
    const prep = await prepareAnsibleAuth({
      credential: {
        host: "host.example",
        username: "u",
        password: "p@ss",
      },
    });
    expect(prep).not.toBeNull();
    const inv = await readFile(prep!.inventoryPath, "utf8");
    expect(inv).toContain("ansible_password=p@ss");
    await prep!.cleanup();
  });
});
