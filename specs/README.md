# Specs — Paquito Feature Workflow

Este directorio contiene las especificaciones de features. Cada feature tiene su propia carpeta con tres documentos obligatorios antes de tocar una sola línea de código.

---

## Flujo completo

```
/spec [feature]
      │
      ▼
specs/[feature]/
├── requirements.md   — EARS requirements (The system shall...)
├── design.md         — Decisiones de arquitectura, alternativas, impacto en archivos
└── tasks.md          — Checklist ordenado de implementación
      │
      │ Amaury revisa y aprueba
      │ → marca [ ] Amaury has reviewed... como [x]
      │
      ▼
/implement [feature]
      │
      ▼
Implementación siguiendo tasks.md en orden.
Cada tarea marcada [x] al completarse.
      │
      ▼
/review [feature]
      │
      ▼
specs/[feature]/review.md   — Reporte de verificación
```

---

## Comandos

| Comando | Qué hace |
|---------|---------|
| `/spec [feature]` | Genera los 3 documentos de spec. Se detiene y espera aprobación. |
| `/implement [feature]` | Lee la spec, verifica aprobación, implementa siguiendo el checklist. |
| `/review [feature]` | Verifica implementación vs spec, audita zona protegida, genera reporte. |

---

## Estructura de una feature

```
specs/
└── mi-feature/
    ├── requirements.md   — Qué debe hacer el sistema (EARS)
    ├── design.md         — Cómo lo hace y por qué (no el código)
    ├── tasks.md          — Lista de tareas ordenadas con checkboxes
    └── review.md         — Generado por /review después de implementar
```

---

## Reglas del flujo

1. **Spec primero, código después.** Nunca se implementa sin spec aprobada.
2. **La aprobación es explícita.** El checkbox `Amaury has reviewed and approved this spec` debe estar marcado en `tasks.md` antes de que `/implement` proceda.
3. **Zona protegida visible desde el inicio.** Si la spec toca `config.ts`, `claude-agent.ts`, `risk-manager.ts`, o `indicators.ts`, se declara en `design.md` y requiere confirmación adicional antes de implementar.
4. **Tasks en orden.** El checklist en `tasks.md` define la secuencia. `/implement` sigue ese orden y marca cada tarea al completarla.
5. **Review cierra el ciclo.** `/review` compara lo implementado contra la spec, no contra expectativas informales. El reporte queda en `specs/[feature]/review.md`.

---

## Zona protegida (recordatorio)

Cualquier spec que toque estos archivos necesita confirmación explícita de Amaury antes de implementar, incluso si la spec ya fue aprobada:

- `src/lib/config.ts` — parámetros de trading
- `src/lib/claude-agent.ts` — pipeline de decisión
- `src/lib/risk-manager.ts` — gates de riesgo
- `src/lib/indicators.ts` — Kalman filter
- `src/lib/news-intelligence.ts` — ajuste de thresholds
- `src/lib/watchlist-monitor.ts` — auto-entry logic
- `src/lib/learning.ts` — loop de aprendizaje
- Cualquier migración de DB

---

## EARS quick reference

| Patrón | Cuándo usar |
|--------|------------|
| `The system shall [X].` | Requisito incondicional |
| `The system shall [X] when [condition].` | Evento disparador |
| `The system shall [X] if [condition].` | Condición opcional |
| `Where [feature], the system shall [X].` | Requisito de componente |
| `The system shall [X] while [condition].` | Estado continuo |
| `The system shall [X] until [condition].` | Condición de terminación |
