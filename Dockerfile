# Etapa de construcción (Build)
# Usamos directamente la imagen de OpenJDK 25 EA para compilar
FROM openjdk:25-ea-jdk-slim AS build
WORKDIR /app

# Instalamos Maven manualmente ya que no hay imagen oficial con JDK 25 todavía
RUN apt-get update && apt-get install -y maven

# Copiar el archivo pom.xml y descargar dependencias
COPY pom.xml .
RUN mvn dependency:go-offline

# Copiar el código fuente y construir
COPY src ./src
RUN mvn clean package -DskipTests

# Etapa de ejecución (Runtime)
FROM openjdk:25-ea-jdk-slim
WORKDIR /app
COPY --from=build /app/target/*.jar ./app.jar

# Configuración del puerto para Koyeb
ENV PORT=8080
EXPOSE 8080

# Usar el puerto de la variable de entorno de Koyeb
ENTRYPOINT ["java", "-Dserver.port=${PORT}", "-jar", "app.jar"]
