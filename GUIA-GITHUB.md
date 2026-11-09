# Cómo subir ComparáSúper a GitHub (paso a paso)

Antes de empezar: descomprimí el zip en tu computadora. Vas a ver estas carpetas y archivos:
`.github`, `data`, `scripts`, `site`, `tests`, `README.md`, `GUIA-GITHUB.md`.

> La carpeta `.github` empieza con punto y en Windows/Mac puede estar oculta.
> Windows: Explorador → Vista → Mostrar → "Elementos ocultos". Mac: en la carpeta, Cmd + Shift + punto.

## 1. Crear el repositorio
1. Entrá a github.com con tu cuenta (brunogagna9-stack).
2. Arriba a la derecha: **+** → **New repository**.
3. Nombre: por ejemplo `ComparaSuper`.
4. Elegí **Public**. (GitHub Pages es gratis solo en repositorios públicos.)
5. Marcá **Add a README file** y tocá **Create repository**.

## 2. Subir los archivos (sin perder las carpetas)
1. En el repositorio: **Add file** → **Upload files**.
2. Arrastrá **las carpetas y archivos** que descomprimiste (no el zip, y no los archivos sueltos de adentro de cada carpeta).
   Tienen que quedar con sus carpetas: `site/index.html`, `scripts/build_data.py`, etc.
3. Si GitHub no acepta la carpeta `.github` arrastrándola, subila aparte:
   **Add file** → **Create new file**, escribí como nombre `.github/workflows/actualizar.yml`,
   pegá el contenido de ese archivo y **Commit changes**. Repetí con `.github/workflows/publicar.yml`.
4. Abajo: **Commit changes**.
5. Comprobá: en la página del repositorio tenés que ver las carpetas `.github`, `data`, `scripts`, `site` y `tests`.
   Si ves `index.html` o `app.js` sueltos en la raíz, se aplanaron: borralos y volvé a subir arrastrando las carpetas.

## 3. Dar permisos para que se actualice solo
1. **Settings** → **Actions** → **General**.
2. Abajo, en **Workflow permissions**, marcá **Read and write permissions** y **Save**.

## 4. Activar la página
1. **Settings** → **Pages**.
2. En **Source** elegí **GitHub Actions**.
3. Andá a la pestaña **Actions** → **Publicar la web** → **Run workflow**.
4. Cuando termine (tilde verde), la dirección aparece en **Settings → Pages**. Va a ser
   `https://brunogagna9-stack.github.io/ComparaSuper/`.
5. Copiá esa dirección en `site/config.json`, en `"sitio_url"` (para que los enlaces de las listas compartidas funcionen):
   abrí el archivo en GitHub → lápiz ✏️ → pegá → **Commit changes**.

## 5. Pasar a precios reales
1. **Actions** → **Actualizar precios** → **Run workflow**.
2. Tarda entre 10 y 40 minutos (el archivo oficial es grande).
3. Si termina con tilde verde, la web se vuelve a publicar sola con precios reales.
   Si termina con cruz roja, abrí la ejecución, copiá el error y pasámelo.
4. Desde ahí corre solo todos los días a las 14 h.

## 6. Cada vez que te mande una actualización
Subí solo los archivos que cambiaron, en su misma carpeta (Add file → Upload files, entrando primero a la carpeta).
Nunca borres `data/history.json`: es el historial de precios acumulado.
