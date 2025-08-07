
CREATE TABLE destino (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL
);

CREATE TABLE guiasyremitos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guiadesde INT NOT NULL,
  guiahasta INT NOT NULL,
  remitodesde INT NOT NULL,
  remitohasta INT NOT NULL,
  modificadosn TINYINT DEFAULT 0,
  fechamodificacion DATE,
  iddestino INT,
  razonsocial VARCHAR(255),
  uuidguiayremito VARCHAR(100) NOT NULL,
  FOREIGN KEY (iddestino) REFERENCES destino(id)
);

CREATE TABLE guiaremovido (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guianro INT NOT NULL,
  devueltosn TINYINT DEFAULT 0,
  fechacarga DATE,
  fechadevolucion DATE,
  fechavigencia DATE,
  fechafinvigencia DATE,
  oc TINYINT DEFAULT 0,
  original TINYINT DEFAULT 0,
  copia TINYINT DEFAULT 0,
  uuidguiayremito VARCHAR(100) NOT NULL
);

CREATE TABLE remitoremovido (
  id INT AUTO_INCREMENT PRIMARY KEY,
  remitonro INT NOT NULL,
  devueltosn TINYINT DEFAULT 0,
  fechacarga DATE,
  fechadevolucion DATE,
  fechavigencia DATE,
  fechafinvigencia DATE,
  oc TINYINT DEFAULT 0,
  original TINYINT DEFAULT 0,
  copia TINYINT DEFAULT 0,
  uuidguiayremito VARCHAR(100) NOT NULL
);

CREATE VIEW vista_trazabilidad AS
SELECT
  g.id AS id_guiaremovido,
  g.guianro,
  g.devueltosn AS guia_devuelta,
  g.fechacarga AS guia_fechacarga,
  g.fechadevolucion AS guia_fechadevolucion,
  g.uuidguiayremito,
  r.id AS id_remitoremovido,
  r.remitonro,
  r.devueltosn AS remito_devuelto,
  r.fechacarga AS remito_fechacarga,
  r.fechadevolucion AS remito_fechadevolucion,
  gr.id AS id_guiasyremitos,
  gr.guiadesde,
  gr.guiahasta,
  gr.remitodesde,
  gr.remitohasta,
  gr.modificadosn,
  gr.fechamodificacion,
  gr.iddestino,
  d.nombre AS destino_nombre,
  gr.razonsocial
FROM guiasyremitos gr
LEFT JOIN guiaremovido g ON gr.uuidguiayremito = g.uuidguiayremito
LEFT JOIN remitoremovido r ON gr.uuidguiayremito = r.uuidguiayremito
LEFT JOIN destino d ON gr.iddestino = d.id;
