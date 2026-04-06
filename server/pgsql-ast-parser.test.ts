import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parse } from "pgsql-ast-parser";

describe("pgsql-ast-parser patch regressions", () => {
  it("supports non-recursive CTE column lists", () => {
    const statements = parse(
      `WITH seed(name) AS (VALUES ('Benu'), ('Quince'))
       SELECT seed.name
       FROM seed`,
    );

    assert.equal(statements.length, 1);
    const statement = statements[0];
    assert.equal(statement?.type, "with");
    const firstBinding = (statement as {
      bind?: Array<{ columnNames?: Array<{ name: string }> }>;
    })?.bind?.[0];
    assert.deepEqual(firstBinding?.columnNames, [{ name: "name" }]);
  });
});
