# YuiBot-datos ☁️

Base de datos **compartida** de [YuiBot-MD](https://github.com/AmilcarGit/YuiBot-MD): una API pequeña para Vercel que guarda en **Upstash Redis** (plan gratis) las monedas, niveles, XP, registro, trabajos, mejoras y rankings de los usuarios, para que sean **los mismos en todas las instalaciones** del bot.

> Mantén este repositorio **privado**. El código no tiene secretos, pero si usas también el respaldo automático del bot (`.respaldonube`), la carpeta `data/` contiene datos de usuarios.

## Cómo funciona

```
Bot (Termux) ──cada 2 min──▶  POST /api/sync  ──▶  Upstash Redis
   ▲  datos locales (JSON)         │ une, valida y pone topes
   └───── estado oficial ◀─────────┘
```

- El bot **sigue funcionando con sus archivos locales**; si esta API se cae, no pasa nada: sincroniza cuando vuelva.
- Cada 2 minutos el bot manda lo que cambió (cuánto ganó/gastó cada persona) y recibe el total oficial.
- **Monedas, XP, mensajes, reputación, veces y ganancia de trabajos** se **suman** entre instalaciones. **Mejoras, rachas y tiempos de espera** se quedan con el mayor. **Inventario y logros** se juntan. Lo demás (nombre, edad, boosts…) gana el registro más reciente.
- El **nivel** lo recalcula el servidor.

## Seguridad

- Los números de teléfono **no se guardan**: se convierten en un código irreversible (HMAC con `DATOS_PEPPER`). El ranking muestra el número **enmascarado** (`519•••479`).
- Cada instalación se registra sola y recibe una clave propia (se guarda como hash). Si alguien hace trampa, la bloqueas con `/api/admin`.
- Topes del servidor (se cambian con variables de entorno): máx. 100 000 monedas por sincronización y 500 000 por hora por usuario, 2 000 XP por sincronización, 200 usuarios por petición y 30 peticiones por minuto por instalación.
- **Reintentos seguros:** cada petición lleva un identificador (`rid`); si la respuesta se pierde y el bot repite la petición, el servidor devuelve lo ya calculado sin sumar otra vez.
- **Semilla:** una instalación con datos anteriores aporta su saldo inicial una sola vez por persona (hasta 1 000 000 monedas y 200 000 XP).
- **Límite honesto:** un bot modificado puede mentir dentro de esos topes. Los topes lo hacen aburrido, no imposible. Revisa el ranking de vez en cuando y bloquea instalaciones sospechosas.

## Despliegue (5 pasos, todo gratis)

1. En [vercel.com](https://vercel.com) → **Add New → Project** → importa este repositorio (Framework: *Other*). Pulsa **Deploy**.
2. En el proyecto: **Storage → Create Database → Upstash (Redis)** → plan *Free* → conéctalo al proyecto. Vercel añade solo `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
3. **Settings → Environment Variables** → agrega `DATOS_PEPPER` con un texto largo y aleatorio (por ejemplo, 40 caracteres cualquiera). **No lo cambies después**: con otro valor todos los usuarios aparecerían como nuevos. Opcional: `ADMIN_TOKEN`.
4. **Deployments → Redeploy** (para que tome las variables).
5. Prueba abriendo `https://TU-PROYECTO.vercel.app/api/salud`: debe responder `{"ok":true,…}`. Esa dirección (`https://TU-PROYECTO.vercel.app`) es la que se pone en el bot (`SYNC.URL` en `defaults.js`, o `SYNC_URL` en el `.env`).

## Rutas

| Ruta | Para qué |
|---|---|
| `GET /api/salud` | Comprobar que está vivo |
| `POST /api/registrar` | La instalación obtiene `{id, clave}` (el bot lo hace solo) |
| `POST /api/sync` | Sincronizar usuarios (cabeceras `x-instalacion` y `x-clave`) |
| `GET /api/top?campo=monedas\|xp\|trabajos\|semana&limite=10` | Ranking global |
| `POST /api/admin` | `{ "id": "…", "baneada": true }` con cabecera `x-admin-token` |

## Desarrollo

```
npm install
npm test        # pruebas con una base en memoria (no necesitan Upstash)
```
