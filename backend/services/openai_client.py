from openai import OpenAI
import logging
from backend.config import OPENAI_API_KEY, DEFAULT_MODEL, MAX_TOKENS

class OpenAIClient:
    def __init__(self, api_key: str = OPENAI_API_KEY, model: str = DEFAULT_MODEL, max_tokens: int = MAX_TOKENS):
        self.client = OpenAI(api_key=api_key)
        self.model = model
        self.max_tokens = max_tokens

    def get_completion(self, prompt: str, system_prompt: str = None, temperature: float = 0.7) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        # ✅ Log prompt and system prompt
        logging.info(f"🔍 Prompt preview: {prompt[:300]}")
        if system_prompt:
            logging.info(f"📤 System prompt: {system_prompt}")

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=self.max_tokens,
                temperature=temperature,
            )

            # ✅ Log response preview
            response_text = response.choices[0].message.content
            logging.info(f"✅ Response preview: {response_text[:300]}")
            return response_text

        except Exception as e:
            logging.exception(f"❌ OpenAI client error: {e}")
            return "Error: Failed to generate response."
