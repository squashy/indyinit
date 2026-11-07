import assert from "node:assert/strict";
import { test } from "node:test";
import { ruleMutants } from "./mutants.ts";
import { exerciseMutant } from "./rules.gate.ts";
import { ENGINE_MISSING, loadContract } from "./rules.engine.ts";

for (const mutant of ruleMutants) {
  test(`mutant ${mutant.id} is caught`, async (t) => {
    const loaded = await loadContract();
    if (!loaded.ok) {
      if (loaded.reason === ENGINE_MISSING) {
        t.skip(ENGINE_MISSING);
        return;
      }
      assert.fail(loaded.reason);
    }
    const caughtBy = exerciseMutant(mutant, loaded.tools);
    assert.ok(caughtBy, `${mutant.id} changed a rule without a failing test`);
  });
}
