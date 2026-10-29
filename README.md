# X: posts de badge azul, colapsados

Userscript para [Tampermonkey](https://www.tampermonkey.net/) que colapsa (o pone en gris) los posts de cuentas con verificación azul en X/Twitter.

*Userscript that collapses (or dims) posts from blue-check accounts on X/Twitter.*

## Instalación

1. Instala Tampermonkey en tu navegador.
2. Abre este enlace y dale **Instalar**:
   **[x-badge-azul-gris.user.js](https://raw.githubusercontent.com/icortesi/x-badge-azul/main/x-badge-azul-gris.user.js)**

Las actualizaciones llegan solas desde este repo.

## Qué hace

- Los posts de cuentas con badge azul aparecen como una barrita: `Post de ✔ @cuenta [Mostrar]`.
- Al darle **Mostrar**, el post se abre y se queda abierto mientras navegas.
- Los quote-tweets se manejan por separado: si alguien sin badge cita a una cuenta azul, solo se colapsa la cita.
- Los badges dorados (organizaciones) y grises (gobierno) no se tocan por defecto.

## Configuración

Edita el bloque `CONFIG` al inicio del script desde el editor de Tampermonkey:

| Opción | Default | Descripción |
|---|---|---|
| `mode` | `'collapse'` | `'collapse'` = barrita con botón · `'dim'` = texto en gris |
| `blue` / `gold` / `gray` | `true` / `false` / `false` | Qué tipos de badge afectar |
| `collapseQuotes` | `true` | Colapsar también quote-tweets |
| `textColor`, `opacity`, `revealOnHover` | — | Solo para modo `dim` |

> Nota: si editas `CONFIG`, una actualización del script puede sobrescribir tus cambios.

## Limitaciones

Depende de los selectores internos de X (`data-testid`) y del color del badge. Si X cambia su DOM, puede dejar de funcionar; abre un issue.

## Licencia

MIT
