# Etapa de construcción (Build)
# Usamos una imagen de Maven que nos permita usar JDK 25
FROM maven:3.9.9-eclipse-temurin-21-alpine AS build
WORKDIR /app

# Copiar el archivo pom.xml
COPY pom.xml .

# Descargar dependencias
# Nota: Maven usará JDK 21 para descargar, lo cual es compatible
RUN mvn dependency:go-offline

# Copiar el código fuente
COPY src ./src

# Construir el jar omitiendo tests para acelerar y evitar problemas de entorno
RUN mvn clean package -DskipTests

# Etapa de ejecución (Runtime)
# Usamos la imagen oficial de OpenJDK 25 (Early Access)
FROM openjdk:25-ea-jdk-slim
WORKDIR /app
COPY --from=build /app/target/*.jar ./app.jar

# Configuración del puerto para Koyeb
ENV PORT=8080
EXPOSE 8080

# Usar el puerto de la variable de entorno de Koyeb
ENTRYPOINT ["java", "-Dserver.port=${PORT}", "-jar", "app.jar"]
