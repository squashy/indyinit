import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { ENGINE_MISSING, loadContract } from "./rules.engine.ts";
import { repoRoot } from "./rules.fixture.ts";
import { ruleCases } from "./rules.cases.ts";

test("the rules gate reports a missing engine", () => {
  const result = spawnSync(process.execPath, ["scripts/box-gate.mjs", "rules"], {
    cwd: repoRoot(),
    encoding: "utf8",
  });
  return loadContract().then((loaded) => {
    if (!loaded.ok && loaded.reason === ENGINE_MISSING) {
      assert.equal(result.status, 0);
      assert.match(result.stdout, /engine missing/);
      assert.match(result.stdout, /rules: SKIP/);
      assert.doesNotMatch(result.stdout, /rules: PASS/);
      return;
    }
    assert.equal(result.status, 0);
    assert.match(result.stdout, /rules: PASS/);
  });
});

for (const ruleCase of ruleCases) {
  test(ruleCase.name, async (t) => {
    const loaded = await loadContract();
    if (!loaded.ok) {
      if (loaded.reason === ENGINE_MISSING) {
        t.skip(ENGINE_MISSING);
        return;
      }
      assert.fail(loaded.reason);
    }
    if (ruleCase.needs === "prepareQuestion" && !loaded.tools.prepareQuestion) {
      t.skip("prepareQuestion missing");
      return;
    }
    ruleCase.run(loaded.tools);
  });
}
