from google import genai

_client: genai.Client | None = None

MODEL = "gemini-3.5-flash"


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client()
    return _client


def generate_text(prompt: str) -> str:
    response = _get_client().models.generate_content(model=MODEL, contents=prompt)
    return response.text