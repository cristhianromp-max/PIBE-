package ec.elpibe.clinica;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class PaqueteClinicoTest {
    @Test
    public void elPaqueteAbreLaClinica() {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("ec.elpibe.clinica", app.getPackageName());
        assertEquals("Clínica El Pibe", app.getString(R.string.app_name));
        assertNotNull(app.getPackageManager().getLaunchIntentForPackage(app.getPackageName()));
    }
}
