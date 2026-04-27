# 📋 GUÍA DE PRUEBA - Restablecimiento de Contraseña

## 🚀 Acceso al Flujo

### Desde Login de Turista
1. Ir a: `http://localhost:3000/login/login.html`
2. Hacer clic en **"¿Olvidé mi contraseña?"**

### Desde Login de Admin
1. Ir a: `http://localhost:3000/admin/admin.html`
2. Hacer clic en **"¿Olvidé mi contraseña?"**

### Acceso Directo
- `http://localhost:3000/restablecer_contraseña/restablecer.html`

---

## ✅ Pasos de Prueba

### PASO 1: Solicitar Código
1. Ingresa un correo electrónico válido (ej: `usuario@example.com`)
2. Haz clic en **"Enviar Código"**
3. **En la consola del navegador (F12 > Console)**, verás:
   ```
   🔐 Código de verificación (testing): 123456
   ```
4. Se mostrará una alerta de éxito

### PASO 2: Verificar Código
1. Se cambiará automáticamente al formulario de verificación
2. Ingresa el código que viste en la consola (ej: `123456`)
3. Haz clic en **"Verificar Código"**
4. Se mostrará un contador que va restando los 10 minutos

### PASO 3: Nueva Contraseña
1. Se mostrará el formulario de nueva contraseña
2. Ingresa una contraseña que cumpla todos los requisitos:
   - ✓ Mínimo 8 caracteres
   - ✓ Al menos una mayúscula (A-Z)
   - ✓ Al menos un número (0-9)
   - ✓ Al menos un carácter especial (!@#$%^&*)
   
   **Ejemplo válido:** `Password123!`

3. Confirma la contraseña en el segundo campo
4. Los requisitos se marcarán en verde conforme los cumplas
5. Haz clic en **"Restablecer Contraseña"**

### PASO 4: Confirmación
1. Se mostrará la pantalla de éxito
2. Haz clic en **"Ir al Login"**
3. Serás redirigido al login correspondiente

---

## 🔄 Flujo Inverso

En cualquier momento puedes:
- **Paso 2:** Haz clic en **"Atrás"** para volver al Paso 1
- **Cualquier momento:** Haz clic en **"Volver al Login"** para salir

---

## 🧪 Casos de Prueba

### ✓ Casos Exitosos
- [ ] Correo válido → Código enviado
- [ ] Código correcto → Verificado
- [ ] Contraseña válida → Restablecida
- [ ] Login con nueva contraseña → Exitoso

### ✗ Casos de Error
- [ ] Correo inválido: Se rechaza
- [ ] Correo no registrado: Muestra alerta
- [ ] Código incorrecto (1x): Muestra error
- [ ] Código incorrecto (3x): Se bloquea
- [ ] Código expirado (10+ min): Se solicita nuevo
- [ ] Contraseña sin mayúscula: Requisito rojo
- [ ] Contraseña sin número: Requisito rojo
- [ ] Contraseña sin carácter especial: Requisito rojo
- [ ] Contraseña < 8 caracteres: Requisito rojo
- [ ] Contraseñas no coinciden: Alerta

---

## 🔑 Datos de Prueba

Si necesitas un usuario de prueba, asegúrate de tener registrado un usuario:
- **Correo:** test@example.com
- **Contraseña:** TempPassword123!

O regístrate en: `http://localhost:3000/registro_turista/turista.html`

---

## 🐛 Troubleshooting

### El código no aparece en la consola
- Abre las DevTools: `F12` o `Right Click > Inspeccionar > Console`
- Verifica que no haya errores en la pestaña "Console"

### El código expira muy rápido
- El tiempo es de 10 minutos
- El contador muestra el tiempo restante
- Si expira, vuelve al Paso 1 para solicitar uno nuevo

### La contraseña no se acepta
- Verifica que cumpla los 4 requisitos (se marcan en verde)
- No copies caracteres especiales de otros programas (pueden no ser reconocidos)

### No puedo iniciar sesión con la nueva contraseña
- Asegúrate de que el restablecimiento mostró la pantalla de éxito
- Intenta con la nueva contraseña en el login
- Verifica que el correo sea correcto

---

## 📊 Endpoints Internos

Si necesitas probar directamente con cURL:

```bash
# Solicitar código
curl -X POST http://localhost:3000/api/auth/solicitar-reset \
  -H "Content-Type: application/json" \
  -d '{"email":"usuario@example.com"}'

# Verificar código
curl -X POST http://localhost:3000/api/auth/verificar-codigo \
  -H "Content-Type: application/json" \
  -d '{"email":"usuario@example.com","codigo":"123456"}'

# Restablecer contraseña
curl -X POST http://localhost:3000/api/auth/restablecer-contraseña \
  -H "Content-Type: application/json" \
  -d '{"email":"usuario@example.com","codigo":"123456","nuevaContraseña":"NewPass123!"}'
```

---

## 📱 Responsive

El flujo está optimizado para:
- ✓ Desktop (400px+)
- ✓ Tablet (480px+)
- ✓ Mobile (320px+)

Prueba redimensionando la ventana o usando dispositivos móviles.

---

**¡Listo para probar!** 🎉
