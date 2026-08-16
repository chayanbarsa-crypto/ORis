CREATE TYPE "public"."estado_extracto" AS ENUM('pendiente', 'procesando', 'auditado', 'error');--> statement-breakpoint
CREATE TYPE "public"."estado_hallazgo" AS ENUM('Cumple', 'No cumple', 'Requiere revisión', 'No evaluable');--> statement-breakpoint
CREATE TYPE "public"."origen_categoria" AS ENUM('regla', 'ia', 'manual');--> statement-breakpoint
CREATE TYPE "public"."severidad" AS ENUM('Crítica', 'Alta', 'Media', 'Baja', 'Informativa');--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" text NOT NULL,
	"nombre" text NOT NULL,
	"padre_id" uuid,
	"color" text,
	"orden" integer DEFAULT 0 NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extractos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" text NOT NULL,
	"nombre_fichero" text NOT NULL,
	"hash" text NOT NULL,
	"tamano_kb" numeric(10, 1),
	"paginas" integer,
	"banco" text,
	"iban" text,
	"periodo_inicio" date,
	"periodo_fin" date,
	"saldo_inicial" numeric(14, 2),
	"saldo_final" numeric(14, 2),
	"estado" "estado_extracto" DEFAULT 'pendiente' NOT NULL,
	"cumplimiento" integer,
	"motor" text,
	"modelo" text,
	"metadatos" jsonb,
	"subido_en" timestamp with time zone DEFAULT now() NOT NULL,
	"auditado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hallazgos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extracto_id" uuid NOT NULL,
	"regla" text NOT NULL,
	"pagina" integer NOT NULL,
	"severidad" "severidad" NOT NULL,
	"estado" "estado_hallazgo" NOT NULL,
	"descripcion" text NOT NULL,
	"evidencia" text DEFAULT '' NOT NULL,
	"sugerencia" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extracto_id" uuid NOT NULL,
	"usuario_id" text NOT NULL,
	"fecha" date NOT NULL,
	"fecha_valor" date,
	"concepto" text NOT NULL,
	"importe" numeric(14, 2) NOT NULL,
	"saldo" numeric(14, 2),
	"categoria_id" uuid,
	"origen" "origen_categoria",
	"confianza" integer,
	"posicion" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reglas_categorizacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" text NOT NULL,
	"categoria_id" uuid NOT NULL,
	"patron" text NOT NULL,
	"prioridad" integer DEFAULT 0 NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hallazgos" ADD CONSTRAINT "hallazgos_extracto_id_extractos_id_fk" FOREIGN KEY ("extracto_id") REFERENCES "public"."extractos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_extracto_id_extractos_id_fk" FOREIGN KEY ("extracto_id") REFERENCES "public"."extractos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reglas_categorizacion" ADD CONSTRAINT "reglas_categorizacion_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categorias_usuario_nombre_idx" ON "categorias" USING btree ("usuario_id","nombre");--> statement-breakpoint
CREATE UNIQUE INDEX "extractos_usuario_hash_idx" ON "extractos" USING btree ("usuario_id","hash");--> statement-breakpoint
CREATE INDEX "extractos_periodo_idx" ON "extractos" USING btree ("usuario_id","periodo_inicio");--> statement-breakpoint
CREATE INDEX "hallazgos_extracto_idx" ON "hallazgos" USING btree ("extracto_id","severidad");--> statement-breakpoint
CREATE INDEX "movimientos_extracto_idx" ON "movimientos" USING btree ("extracto_id","posicion");--> statement-breakpoint
CREATE INDEX "movimientos_usuario_fecha_idx" ON "movimientos" USING btree ("usuario_id","fecha");--> statement-breakpoint
CREATE INDEX "movimientos_categoria_idx" ON "movimientos" USING btree ("usuario_id","categoria_id");--> statement-breakpoint
CREATE INDEX "reglas_cat_usuario_idx" ON "reglas_categorizacion" USING btree ("usuario_id","prioridad");