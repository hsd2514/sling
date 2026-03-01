import asyncio
import json
import os

from google import genai
from google.genai import types

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

_gemini_client: genai.Client | None = None


def _get_gemini() -> genai.Client:
    global _gemini_client
    if _gemini_client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not set.")
        _gemini_client = genai.Client(api_key=api_key)
    return _gemini_client


def _build_system_prompt(context: dict) -> str:
    return f"""You are an expert AI scientist specializing in structural biology and drug discovery.
You have access to the following protein analysis data:

Protein Info: {json.dumps(context.get('parsed', {}), indent=2)}
Binding Pockets: {json.dumps(context.get('pockets', []), indent=2)}
Drug Candidates: {json.dumps(context.get('drugs', []), indent=2)}

Answer questions concisely but with scientific accuracy. Reference specific chains,
residues, and drug properties when relevant."""


async def chat_with_protein(message: str, history: list[dict], context: dict) -> str:
    """Send a chat message with protein context to Gemini."""
    system_prompt = _build_system_prompt(context)
    transcript_lines = []
    for h in history:
        role = h.get("role", "user")
        content = h.get("content", "")
        if not content:
            continue
        speaker = "Assistant" if role == "assistant" else "User"
        transcript_lines.append(f"{speaker}: {content}")
    transcript_lines.append(f"User: {message}")
    prompt = "\n".join(transcript_lines)

    return await _gemini_text(
        system=system_prompt,
        prompt=prompt,
        max_output_tokens=1024,
    )


async def get_drug_reasoning(
    parsed: dict, pockets: list[dict], drugs: list[dict]
) -> dict[str, str]:
    """Ask the LLM to reason about each drug candidate's binding potential."""
    prompt = f"""Given this protein:
{json.dumps(parsed, indent=2)}

And these binding pockets:
{json.dumps(pockets, indent=2)}

For each of the following drugs, provide a one-sentence explanation of why it may bind:
{json.dumps([d['name'] for d in drugs if 'name' in d])}

Respond as a JSON object: {{"DrugName": "reasoning..."}}"""

    system = "You are an expert computational chemist. Respond only with valid JSON."
    raw = await _gemini_text(system=system, prompt=prompt, max_output_tokens=512)

    try:
        # Strip markdown code fences if present
        raw = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(raw)
    except Exception:
        return {}


async def _gemini_text(system: str, prompt: str, max_output_tokens: int) -> str:
    client = _get_gemini()
    config = types.GenerateContentConfig(
        system_instruction=system,
        max_output_tokens=max_output_tokens,
    )

    response = await asyncio.to_thread(
        client.models.generate_content,
        model=GEMINI_MODEL,
        contents=prompt,
        config=config,
    )
    return (response.text or "").strip()
