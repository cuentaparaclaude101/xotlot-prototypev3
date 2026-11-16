# Progreso
- [x] Etapa 1: chat, modos, crisis (reglas + modelo + fallos), configuración
- [x] Etapa 2: panel de padres (cálculo local), vista previa y envío del informe (correo Resend / mailto / WhatsApp), "Cargar 7 días de ejemplo", "Ver como Padres"
- [x] Etapa 3: audio (grabación 30 s, WAV 16 kHz, transcripción en la misma llamada, reglas sobre la transcripción). Falta probar en Android, iPhone y escritorio reales
- [x] Etapa 4: /equipo con STAFF_PASSWORD, alertas (Blobs), correo opcional, borrado de alertas por alias, resúmenes de conocimiento (File Search pendiente)
Pendiente de probar en navegador real y con clave de Gemini. Falta límite de tasa del envío (3/hora) en `report`.

## Adenda v0.3
- [x] Etapa 5: conversaciones en el servidor (Netlify Blobs), lista `/equipo` con colores (verde/amarillo/rojo con texto), vista de chat, aviso al usuario, "Borrar mis datos" borra también en el servidor. Probado con Blobs simulados (`npm test`) y en navegador (Playwright).
- [x] Etapa 6: modos IA / Asistido / Manual, aviso al usuario con el nombre del profesional, reglas de crisis activas en Manual, tiempos de espera (2 min nivel 3, 5 min nivel 2; mensaje fijo al doble), un profesional por chat, auditoría, polling adaptable (3 s / 15 s).
- [x] Etapa 7 (parcial): panel de escritorio de 3 columnas (`equipo.html`, solo PC, aviso bajo 1100 px) con los mismos colores y burbujas del modo usuario. El modo usuario ya usaba el tema oscuro violeta. **Falta:** revisión visual de Lea y, si quiere, ajustar detalles contra su HTML de referencia.
- [x] Etapa 8: etiquetas por caso, búsqueda (usuarios por alias/etiqueta y dentro del chat con resaltado), plantillas de respuesta (todas BLOQUEADAS hasta que un psicólogo ponga `aprobada: true` en `config/plantillas.es.json`), exportar registro de actividad a CSV, notas por caso (ya estaban).
- Pendiente: probar con Netlify real, clave de Gemini real y dos dispositivos reales.
- [x] 15-nov: 5 IAs con respaldo, textos limpios, botón de grabar, avatar, menos trabas (ver DECISIONES.md). Pendiente: probar con claves reales.
