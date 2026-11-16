# Prototipo Acompañante (Netlify + Gemini) — Etapa 1
Chat, modos 8–12 / 13–17, capa de reglas de crisis y respuestas fijas. **Solo datos ficticios.**
## Desplegar
1. Repositorio **privado** de GitHub → Netlify: Add new site → Import from GitHub.
2. Variables: `GEMINI_API_KEY`, `GEMINI_MODEL` (verificar nombre vigente en la documentación de Google), `PILOT_ACCESS_CODE`, `STAFF_PASSWORD`.
   IAs de respaldo (opcionales, hasta 4 más; cada una con su clave y modelo): `AI2_KEY`+`AI2_MODEL` (Groq), `AI3_*` (OpenRouter), `AI4_*` (Cerebras), `AI5_*` (Mistral). Ver `config/providers.json`.
3. Redesplegar al cambiar variables. Probar con el código de piloto.
## Pruebas
`npm test` (capa de reglas, sin IA).
## Pendiente
Revisión de `config/crisis-fallback.es.json` y `risk-terms.es-SV.json` por psicólogos; líneas locales en `crisis-contacts.json` (solo 911 mientras tanto). Etapas 2–4 (padres/informe, audio, equipo).
