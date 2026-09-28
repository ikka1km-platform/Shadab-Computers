package com.vyapaar.billing;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(
    name = "BluetoothPrinter",
    permissions = {
        @Permission(
            alias = "bluetooth",
            strings = {
                Manifest.permission.BLUETOOTH,
                Manifest.permission.BLUETOOTH_ADMIN
            }
        ),
        @Permission(
            alias = "bluetoothConnect",
            strings = {
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN
            }
        )
    }
)
public class BluetoothPrinterPlugin extends Plugin {

    // Standard Bluetooth Serial Port Profile (SPP) RFCOMM UUID
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private BluetoothSocket activeSocket = null;
    private String activeAddress = null;

    private boolean checkBluetoothPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return getActivity().checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    @PluginMethod
    public void listPairedDevices(PluginCall call) {
        if (!checkBluetoothPermissions()) {
            requestPermissionForAlias("bluetoothConnect", call, "listPairedDevicesCallback");
            return;
        }

        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null) {
                call.reject("Bluetooth is not supported on this device.");
                return;
            }

            if (!adapter.isEnabled()) {
                call.reject("Bluetooth is disabled. Please turn on Bluetooth in settings.");
                return;
            }

            Set<BluetoothDevice> pairedDevices = adapter.getBondedDevices();
            JSArray devicesArray = new JSArray();

            if (pairedDevices != null) {
                for (BluetoothDevice device : pairedDevices) {
                    JSObject devObj = new JSObject();
                    String name = device.getName();
                    devObj.put("name", name != null ? name : "Unknown Bluetooth Device");
                    devObj.put("address", device.getAddress());
                    devObj.put("type", "bluetooth");
                    devicesArray.put(devObj);
                }
            }

            JSObject ret = new JSObject();
            ret.put("devices", devicesArray);
            call.resolve(ret);
        } catch (SecurityException se) {
            call.reject("Bluetooth permission denied by system: " + se.getMessage());
        } catch (Exception e) {
            call.reject("Error fetching paired Bluetooth devices: " + e.getMessage());
        }
    }

    @PermissionCallback
    private void listPairedDevicesCallback(PluginCall call) {
        if (checkBluetoothPermissions()) {
            listPairedDevices(call);
        } else {
            call.reject("Bluetooth connect permission is required to find paired printers.");
        }
    }

    @PluginMethod
    public void printRaw(PluginCall call) {
        if (!checkBluetoothPermissions()) {
            requestPermissionForAlias("bluetoothConnect", call, "printRawCallback");
            return;
        }

        String address = call.getString("address");
        String base64Data = call.getString("data");

        if (address == null || address.isEmpty()) {
            call.reject("Printer Bluetooth MAC address is required.");
            return;
        }

        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("No print data provided.");
            return;
        }

        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            call.reject("Bluetooth is not available or disabled.");
            return;
        }

        BluetoothSocket socket = null;
        try {
            byte[] bytesToPrint = Base64.decode(base64Data, Base64.DEFAULT);
            BluetoothDevice device = adapter.getRemoteDevice(address.trim());

            adapter.cancelDiscovery();

            try {
                socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                socket.connect();
            } catch (Exception e1) {
                // Reflection fallback for stubborn thermal printer chips
                try {
                    Method m = device.getClass().getMethod("createRfcommSocket", new Class[]{int.class});
                    socket = (BluetoothSocket) m.invoke(device, 1);
                    socket.connect();
                } catch (Exception e2) {
                    throw new Exception("Unable to connect to thermal printer at " + address + ": " + e1.getMessage());
                }
            }

            OutputStream os = socket.getOutputStream();
            os.write(bytesToPrint);
            os.flush();

            // Wait a brief moment for printer buffer
            Thread.sleep(150);

            socket.close();
            socket = null;

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("message", "Print job sent to " + address);
            call.resolve(ret);
        } catch (SecurityException se) {
            call.reject("Bluetooth permission required: " + se.getMessage());
        } catch (Exception e) {
            call.reject("Failed to print to thermal printer: " + e.getMessage());
        } finally {
            if (socket != null) {
                try {
                    socket.close();
                } catch (Exception ignored) {}
            }
        }
    }

    @PermissionCallback
    private void printRawCallback(PluginCall call) {
        if (checkBluetoothPermissions()) {
            printRaw(call);
        } else {
            call.reject("Bluetooth permission denied. Cannot transmit print data.");
        }
    }

    @PluginMethod
    public void printDocument(PluginCall call) {
        final String htmlContent = call.getString("html");
        final String jobName = call.getString("title", "Receipt Print");

        if (htmlContent == null || htmlContent.isEmpty()) {
            call.reject("HTML content is required");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                WebView printWebView = new WebView(getActivity());
                printWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        PrintManager printManager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                        if (printManager != null) {
                            PrintDocumentAdapter printAdapter = printWebView.createPrintDocumentAdapter(jobName);
                            PrintAttributes.Builder builder = new PrintAttributes.Builder();
                            builder.setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME);
                            printManager.print(jobName, printAdapter, builder.build());
                            call.resolve(new JSObject().put("success", true));
                        } else {
                            call.reject("Android Print Service unavailable.");
                        }
                    }
                });
                printWebView.loadDataWithBaseURL(null, htmlContent, "text/html", "UTF-8", null);
            } catch (Exception e) {
                call.reject("Native print failed: " + e.getMessage());
            }
        });
    }
}
