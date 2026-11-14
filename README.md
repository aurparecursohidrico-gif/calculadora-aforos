# Aforos AURPA

App de aforos de la Asociación de Usuarios del Río La Paila (AURPA). Elaborada por Ing. Mariana Charry.

- **Inicio de sesión** con usuario y contraseña. El administrador crea las cuentas.
- **Calculadora de aforos:** molinete (sección media, río o canal), volumétrico, flotador, vertederos y canal Parshall. Guarda cada aforo en el Drive de AURPA, por método y por sitio.
- **Lluvias:** lluvia diaria y mensual de la cuenca (pluviómetros de los boletines AURPA 2026).
- **Lluvias vs caudales:** compara la lluvia con el caudal aforado en cada sitio.
- **Tabla de caudales:** fecha y Q por método y sitio, actualizada con cada aforo guardado.
- **Mapa:** cuenca del río La Paila, río, Derivación 2, puntos de captación y puntos de aforo.

Archivos:
- `index.html`: la app.
- `datos-lluvias.json`: lluvia diaria ponderada de la cuenca (febrero–octubre 2026).
- `mapa/`: capas del mapa exportadas de QGIS.
- `drive/Codigo.gs`: programa de Google Apps Script que guarda y entrega los datos del Drive.
