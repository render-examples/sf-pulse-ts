import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRss } from "../cron-refresh.js";
import { readFixture } from "./test-helpers.js";

describe("parseRss()", () => {
  it("parses RSS 2.0 items", () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>First post</title>
      <link>https://example.com/1</link>
      <pubDate>Mon, 01 Apr 2026 12:00:00 GMT</pubDate>
      <description>A short description.</description>
    </item>
    <item>
      <title>Second post</title>
      <link>https://example.com/2</link>
      <pubDate>Tue, 02 Apr 2026 12:00:00 GMT</pubDate>
      <description>Another description.</description>
    </item>
  </channel>
</rss>`;
    const items = parseRss(xml);
    assert.equal(items.length, 2);
    assert.equal(items[0].title, "First post");
    assert.equal(items[0].link, "https://example.com/1");
    assert.ok(
      items[0].pubDate.includes("Apr 2026") ||
        items[0].pubDate.includes("01 Apr 2026"),
    );
    assert.equal(items[0].description, "A short description.");
  });

  it("parses Atom feed entries", () => {
    const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Eater SF</title>
  <entry>
    <title type="html"><![CDATA[New Taco Place Opens in the Mission]]></title>
    <link rel="alternate" href="https://sf.eater.com/article/1"/>
    <published>2026-04-03T18:05:42-04:00</published>
    <summary type="html"><![CDATA[A great new spot.]]></summary>
  </entry>
  <entry>
    <title type="html"><![CDATA[Best Brunch Spots April 2026]]></title>
    <link rel="alternate" href="https://sf.eater.com/article/2"/>
    <published>2026-04-01T10:00:00-04:00</published>
    <summary type="html"><![CDATA[Our top picks.]]></summary>
  </entry>
</feed>`;
    const items = parseRss(xml);
    assert.equal(items.length, 2);
    assert.equal(items[0].title, "New Taco Place Opens in the Mission");
    assert.equal(items[0].link, "https://sf.eater.com/article/1");
    assert.ok(items[0].pubDate.includes("2026-04-03"));
    assert.equal(items[0].description, "A great new spot.");
  });

  it("handles CDATA wrappers in RSS 2.0 titles", () => {
    const xml = `<rss version="2.0"><channel>
      <item>
        <title><![CDATA[CDATA Title & More]]></title>
        <link>https://example.com/a</link>
        <pubDate>Mon, 01 Apr 2026 00:00:00 GMT</pubDate>
        <description><![CDATA[Body text here.]]></description>
      </item>
    </channel></rss>`;
    const items = parseRss(xml);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, "CDATA Title & More");
  });

  it("returns empty array for empty XML", () => {
    assert.deepEqual(parseRss(""), []);
  });

  it("returns empty array for malformed XML with no items", () => {
    assert.deepEqual(parseRss("<rss><channel></channel></rss>"), []);
  });

  it("strips HTML tags from titles", () => {
    const xml = `<rss version="2.0"><channel>
      <item>
        <title><b>Bold Title</b> with <em>emphasis</em></title>
        <link>https://example.com/b</link>
        <pubDate>Mon, 01 Apr 2026 00:00:00 GMT</pubDate>
        <description>desc</description>
      </item>
    </channel></rss>`;
    const items = parseRss(xml);
    assert.equal(items.length, 1);
    assert.ok(!items[0].title.includes("<b>"));
    assert.ok(items[0].title.includes("Bold Title"));
  });

  it("parses a saved live Funcheap feed", () => {
    const xml = readFixture("funcheap-feed-live.xml");
    const items = parseRss(xml);

    assert.ok(items.length >= 5);
    assert.equal(
      items[0].title,
      "7/4/26: Nike Missile Site Open House &#038; Storytelling | Marin Headlands - FREE",
    );
    assert.equal(
      items[0].link,
      "https://sf.funcheap.com/nike-missile-site-open-house-storytelling-marin-headlands-154/",
    );
  });
});
