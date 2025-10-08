import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const PROMPT_DIR = path.join(ROOT, "src", "prompt");

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type"); // thesis | antithesis | synthesis
    if (!type) return NextResponse.json({ error: "type required" }, { status: 400 });

    const map: Record<string, string> = {
      thesis: "正.md",
      antithesis: "反.md",
      synthesis: "合.md"
    };
    const filename = map[type];
    if (!filename) return NextResponse.json({ error: "invalid type" }, { status: 400 });

    const filePath = path.join(PROMPT_DIR, filename);
    const content = await readFile(filePath, "utf8");
    return NextResponse.json({ type, content });
  } catch (error: any) {
    console.error("/api/prompts error", { message: error?.message });
    return NextResponse.json({ error: "prompt_read_failed" }, { status: 500 });
  }
}


