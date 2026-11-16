# Decisiones
- Frontend en un solo index.html sin compilación, con variables de INDEX-v5.html (la Adenda citaba v4).
- Niveles 0–3 en el prototipo; el Documento Maestro define también un nivel 4 (emergencia inminente): tratarlo como nivel 3 aquí y decidir con psicólogos.
- Se usa `riskLevel` del modelo en la misma llamada; nunca se baja un piso de reglas (más estricto que la excepción de la guía).
- Gemini capa gratuita: el contenido puede usarse para mejorar productos de Google → solo datos ficticios; revisión legal antes de menores reales.
- Alertas: Netlify Blobs (si falla, queda en logs). Consumo de Netlify y límites 429 observados: anotar aquí.

## Adenda v0.3 (decisiones y pendientes)
- Asistido = el profesional solo mira y la IA sigue respondiendo (interpretación a CONFIRMAR con Lea).
- Colores: verde = niveles 0-1, amarillo = nivel 2, rojo = nivel 3 o señal de abuso (a confirmar con psicólogos). El color usa el nivel más alto de 24 h; el rojo solo baja con "Marcar como revisado" (queda en auditoría). Un caso revisado ignora los eventos anteriores a la revisión.
- Tiempos en Manual (config/app.json): 2 min nivel 3, 5 min nivel 2; al doble se envía el mensaje fijo de seguridad (una vez, etiquetado "automático") y el panel ofrece volver a IA. A definir por psicólogos.
- Mensajes etiquetados: usuario / ia / profesional / sistema (avisos y mensaje fijo automático).
- En Manual corren solo las reglas deterministas (no el clasificador del modelo). Los audios no se aceptan en Manual (requieren al modelo para transcribir).
- Se guarda la transcripción de los audios como texto de la conversación; el audio nunca se guarda.
- Netlify: cada mensaje es un blob propio (sin contador compartido, evita choques de escritura). Polling: usuario 3 s en Asistido/Manual, 15 s en IA, 20 s en pestaña oculta; panel: lista 15 s, chat abierto 3 s (Asistido/Manual) o 15 s (IA). Si no hay cambios, la función no lista mensajes. ANOTAR AQUÍ el consumo real de créditos tras probar.
- Auditoría: quién abrió una conversación (máx. 1 vez/10 min por persona), cambios de modo, mensajes enviados (sin contenido), revisados y notas. No se borra al "Borrar mis datos" (solo guarda alias ficticio y acciones).
- La contraseña del equipo se guarda en sessionStorage del navegador del profesional. Antes de usar con menores reales: cuentas individuales.
- Pendientes legales/privacidad: el equipo ve todas las conversaciones (aceptable solo con datos ficticios y aviso al usuario); decidir con psicólogos y abogado quién ve qué; revisión legal de que una persona atienda a un menor por chat y de las obligaciones de denuncia.
- No se tomó del HTML de referencia ("MancApp"): nombre, logo, íconos, fotos, Firebase, llamadas, envío de fotos, modo efímero, PIN, ntfy.

## Etapa 8
- Plantillas: son borradores. El servidor NO entrega el texto de una plantilla con `aprobada: false`; el panel las muestra como "Pendiente de aprobación". Al insertar una aprobada, queda editable antes de enviar. Revisarlas con los psicólogos.
- Etiquetas: hasta 6 por caso, solo letras, números, espacios, guion y guion bajo; cada cambio queda en auditoría.
- Exportar CSV: incluye hora, quién, acción, alias, detalle e id de conversación (nunca el contenido de los mensajes); la exportación misma queda registrada. Las celdas que empiezan con = + - @ se neutralizan.
- Búsqueda dentro de mensajes solo del chat abierto (en el navegador); no hay búsqueda global de contenido, por privacidad y costo.

## Cambios del 15-nov-2026 (varias IAs, textos y rendimiento)
- **5 IAs con respaldo automático** (`config/providers.json`, `netlify/functions/_lib/ai.js`): Gemini + 4 más (Groq, OpenRouter, Cerebras, Mistral; formato "chat completions"). Se usa la primera sana; si falla (cuota 429, clave mala, caída, lentitud) pasa a la siguiente dentro de ~7,5 s (Netlify corta a ~10 s). Un proveedor que falla descansa 2 min (cuota), 30 min (clave/modelo inválido) o 20 s (otros). Si fallan todas: misma lógica de antes (reglas -> respuesta fija de crisis; sin riesgo -> mensaje de reintento).
- Un proveedor entra solo si tiene clave y modelo en variables de Netlify: `AI2_KEY/AI2_MODEL`, `AI3_*`, `AI4_*`, `AI5_*` (opcional `AIn_URL`). Los nombres de modelo NO están en el código: verificarlos en la documentación de cada proveedor.
- Audios: solo Gemini los transcribe. Si Gemini falla con un audio, se pide al usuario que escriba.
- **Privacidad:** cada proveedor adicional recibe el texto de las conversaciones. Capas gratuitas pueden usar los datos para mejorar sus productos → solo datos ficticios; revisar términos de cada uno antes de menores reales.
- Quitado el descargo repetido "no soy una persona ni psicólogo" (saludo, bienvenida, menú y prompts). Se mantiene la etiqueta "Acompañante con IA" en el encabezado y la IA responde con la verdad si le preguntan directo (regla 3.7).
- Quitados el banner superior "Versión de prueba" y la nota de audios. Se conserva el aviso "el equipo puede ver las conversaciones" (entrada, menú y bajo el chat).
- Botón de grabar visible y grande; se alterna con enviar cuando hay texto. Avatar (ajolote) en `avatar.jpg`, también como ícono.
- Rendimiento: sin `backdrop-filter`, el chat ya no se reconstruye entero en cada mensaje y el servidor guarda mensaje y resumen en paralelo.
