# Aforos AURPA

App de aforos de la Asociación de Usuarios del Río La Paila (AURPA). Elaborada por Ing. Mariana Charry.

**Link de la app:** https://aurparecursohidrico-gif.github.io/calculadora-aforos/

- **Inicio de sesión** con usuario y contraseña. El administrador crea las cuentas.
- **Calculadora de aforos:** molinete (sección media, río o canal), volumétrico, flotador, vertederos y canal Parshall. Los roles Administrador y Usuario guardan cada aforo en el Drive de AURPA (con lugar, fecha y hora), por método y por sitio.
- **Lluvias:** lluvia diaria y mensual de la cuenca, con el mapa de lluvias de cada mes.
- **Lluvias vs caudales:** compara la lluvia con el caudal aforado en cada sitio.
- **Tabla de caudales:** fecha y Q por método y sitio, actualizada con cada aforo guardado.
- **Mapa:** cuenca del río La Paila, río, Derivación 2, puntos de captación y puntos de aforo.
- **Resoluciones CVC:** concesiones de agua de cada usuario (vigencia de 10 años, número, caudal, coordenadas y el documento completo con acceso directo al Resuelve). Los documentos están solo en el Drive de AURPA, nunca en este repositorio.

## Roles

| Rol | Puede |
|---|---|
| Administrador | Todo: guardar aforos, subir lluvias y mapas, ubicar sitios, crear usuarios y cambiar roles, agregar/editar/eliminar resoluciones. |
| Usuario | Guardar aforos y consultar todas las herramientas, incluidas las resoluciones. No edita lo demás. |
| Otros | Consultar las herramientas. No ve las resoluciones CVC. |

## Dónde está cada cosa

- **La app** (este repositorio, GitHub Pages): cuenta de GitHub de AURPA.
- **Los datos y el servidor:** cuenta de Google **aurparecursohidrico@gmail.com**.
  - Drive → carpeta **Aforos AURPA / Calculadora**: aforos por método y sitio, resúmenes, lluvias, mapas de lluvias, ubicaciones, usuarios y la carpeta **Resoluciones (app)**.
  - Apps Script → proyecto **Calculadora de aforos** (el código está en `drive/Codigo.gs`).

## Mantenimiento

- **Tareas del día a día** (sin programar, desde la app con un usuario Administrador): subir las lluvias y el mapa del mes (pantalla Lluvias), agregar o actualizar resoluciones subiendo el PDF (pantalla Resoluciones CVC), crear usuarios y cambiar roles (pantalla Usuarios), ubicar puntos de aforo (pantalla Mapa).
- **Si se pierden todos los administradores:** con la cuenta de Google de AURPA, abrir la hoja «Usuarios de la app (no compartir)» y escribir `admin` en la columna Rol de la persona que corresponda.
- **Cambiar el código del servidor:** copiar `drive/Codigo.gs` en el proyecto de Apps Script, guardar y luego Implementar → Gestionar implementaciones → ✏️ → Nueva versión → Implementar (la dirección del servidor no cambia).
- **Cambiar la app:** editar `index.html` (contiene toda la app) y subir el cambio a este repositorio; GitHub Pages lo publica en uno o dos minutos.

Archivos:
- `index.html`: la app.
- `datos-lluvias.json` y `lluvias/`: serie base de lluvias de la cuenca (febrero–octubre 2026) y sus mapas.
- `mapa/`: capas del mapa exportadas de QGIS.
- `drive/Codigo.gs`: programa de Google Apps Script que guarda y entrega los datos del Drive.
