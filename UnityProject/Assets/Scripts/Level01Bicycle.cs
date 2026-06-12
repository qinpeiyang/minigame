using UnityEngine;
using UnityEngine.UI;
using System.Collections.Generic;

namespace GiantCleaner
{
    public class Level01Bicycle : MonoBehaviour
    {
        public static readonly List<DirtPatch> DirtPatches = new List<DirtPatch>();
        private Text progressText;
        private Image progressFill;
        private FirstPersonCleanerController controller;

        void Start()
        {
            DirtPatches.Clear();
            BuildLighting();
            BuildRoom();
            BuildBicycle();
            BuildPlayer();
            BuildUI();
        }

        void Update()
        {
            float total = 0f;
            float left = 0f;
            foreach (var d in DirtPatches)
            {
                total += d.maxHealth;
                left += Mathf.Max(0, d.health);
            }
            float clean = total <= 0 ? 1 : 1f - left / total;
            if (progressText) progressText.text = Mathf.FloorToInt(clean * 100f) + "% CLEAN";
            if (progressFill) progressFill.fillAmount = clean;
        }

        void BuildLighting()
        {
            RenderSettings.ambientLight = new Color(0.28f, 0.32f, 0.36f);
            RenderSettings.fog = true;
            RenderSettings.fogColor = new Color(0.42f, 0.50f, 0.54f);
            RenderSettings.fogDensity = 0.018f;

            var sun = new GameObject("Key Light");
            var l = sun.AddComponent<Light>();
            l.type = LightType.Directional;
            l.intensity = 1.2f;
            l.color = new Color(1f, 0.96f, 0.86f);
            sun.transform.rotation = Quaternion.Euler(48, -35, 0);

            for (int i = 0; i < 4; i++)
            {
                var lamp = new GameObject("Ceiling Softbox " + i);
                lamp.transform.position = new Vector3(-5 + i * 3.3f, 3.3f, -2.5f);
                var pl = lamp.AddComponent<Light>();
                pl.type = LightType.Point;
                pl.range = 7;
                pl.intensity = 1.1f;
                pl.color = new Color(0.82f, 0.95f, 1f);
            }
        }

        Material Mat(string name, Color color, float smoothness = 0.45f)
        {
            var m = new Material(Shader.Find("Standard"));
            m.name = name;
            m.color = color;
            m.SetFloat("_Glossiness", smoothness);
            return m;
        }

        GameObject Cube(string name, Vector3 pos, Vector3 scale, Material mat)
        {
            var o = GameObject.CreatePrimitive(PrimitiveType.Cube);
            o.name = name;
            o.transform.position = pos;
            o.transform.localScale = scale;
            if (mat) o.GetComponent<Renderer>().material = mat;
            return o;
        }

        GameObject Cylinder(string name, Vector3 pos, Vector3 scale, Quaternion rot, Material mat)
        {
            var o = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            o.name = name;
            o.transform.position = pos;
            o.transform.localScale = scale;
            o.transform.rotation = rot;
            if (mat) o.GetComponent<Renderer>().material = mat;
            return o;
        }

        void BuildRoom()
        {
            var floorMat = Mat("wet concrete floor", new Color(0.48f, 0.56f, 0.55f), 0.78f);
            var wallMat = Mat("white ceramic tile wall", new Color(0.78f, 0.82f, 0.80f), 0.62f);
            var blueMat = Mat("blue wall stripe", new Color(0.02f, 0.38f, 0.70f), 0.55f);
            var darkMat = Mat("dark ceiling", new Color(0.10f, 0.13f, 0.14f), 0.3f);

            Cube("wet floor", new Vector3(0, -0.05f, 0), new Vector3(14, 0.1f, 12), floorMat);
            Cube("ceiling", new Vector3(0, 3.4f, 0), new Vector3(14, 0.12f, 12), darkMat);
            Cube("back wall", new Vector3(0, 1.6f, -6), new Vector3(14, 3.2f, 0.14f), wallMat);
            Cube("front half wall", new Vector3(0, 1.6f, 6), new Vector3(14, 3.2f, 0.14f), wallMat);
            Cube("left wall", new Vector3(-7, 1.6f, 0), new Vector3(0.14f, 3.2f, 12), wallMat);
            Cube("right wall", new Vector3(7, 1.6f, 0), new Vector3(0.14f, 3.2f, 12), wallMat);
            Cube("blue stripe back", new Vector3(0, 1.45f, -5.91f), new Vector3(14, 0.16f, 0.05f), blueMat);
            Cube("blue stripe right", new Vector3(6.91f, 1.45f, 0), new Vector3(0.05f, 0.16f, 12), blueMat);

            // tile grooves
            var groove = Mat("tile groove", new Color(0.52f, 0.57f, 0.56f), 0.2f);
            for (int i = -6; i <= 6; i++) Cube("floor groove z " + i, new Vector3(0, 0.006f, i), new Vector3(14, 0.012f, 0.018f), groove);
            for (int i = -7; i <= 7; i++) Cube("floor groove x " + i, new Vector3(i, 0.008f, 0), new Vector3(0.018f, 0.012f, 12), groove);

            // props
            var red = Mat("red barrel", new Color(0.65f, 0.16f, 0.10f), 0.35f);
            Cylinder("cleaning barrel", new Vector3(-5.1f, 0.55f, 3.4f), new Vector3(0.45f, 0.55f, 0.45f), Quaternion.identity, red);
            var cone = Mat("safety cone orange", new Color(1f, 0.36f, 0.08f), 0.25f);
            Cylinder("safety cone", new Vector3(4.8f, 0.45f, 2.3f), new Vector3(0.34f, 0.45f, 0.34f), Quaternion.identity, cone);
        }

        void BuildBicycle()
        {
            var black = Mat("rubber black", new Color(0.015f, 0.016f, 0.017f), 0.32f);
            var metal = Mat("brushed metal", new Color(0.65f, 0.70f, 0.72f), 0.78f);
            var paint = Mat("blue bicycle paint", new Color(0.04f, 0.42f, 0.86f), 0.74f);
            var leather = Mat("seat leather", new Color(0.05f, 0.035f, 0.025f), 0.38f);

            var bike = new GameObject("Realistic Dirty Bicycle");
            bike.transform.position = new Vector3(0, 0, -1.4f);
            bike.transform.rotation = Quaternion.Euler(0, 8, 0);

            // wheels approximated by many tire cylinders around circles
            BuildWheel(bike.transform, new Vector3(-1.35f, 0.72f, 0), 0.72f, black, metal);
            BuildWheel(bike.transform, new Vector3(1.35f, 0.72f, 0), 0.72f, black, metal);

            Rod("top tube", bike.transform, new Vector3(-0.68f, 1.35f, 0), new Vector3(0.74f, 1.35f, 0), 0.055f, paint);
            Rod("down tube", bike.transform, new Vector3(-0.72f, 1.32f, 0), new Vector3(0.02f, 0.78f, 0), 0.06f, paint);
            Rod("seat tube", bike.transform, new Vector3(-0.72f, 1.32f, 0), new Vector3(-0.25f, 0.78f, 0), 0.055f, paint);
            Rod("chain stay", bike.transform, new Vector3(-1.35f, 0.72f, 0), new Vector3(-0.25f, 0.78f, 0), 0.045f, paint);
            Rod("front fork", bike.transform, new Vector3(1.35f, 0.72f, 0), new Vector3(0.74f, 1.35f, 0), 0.05f, metal);
            Rod("rear stay", bike.transform, new Vector3(-1.35f, 0.72f, 0), new Vector3(-0.72f, 1.32f, 0), 0.045f, metal);
            Rod("handle bar", bike.transform, new Vector3(0.74f, 1.35f, 0), new Vector3(1.05f, 1.75f, 0), 0.045f, metal);
            Rod("flat handle", bike.transform, new Vector3(0.62f, 1.76f, -0.42f), new Vector3(1.35f, 1.76f, 0.42f), 0.04f, metal);
            Rod("seat post", bike.transform, new Vector3(-0.72f, 1.32f, 0), new Vector3(-0.82f, 1.72f, 0), 0.04f, metal);
            var seat = Cube("black seat", new Vector3(-0.92f, 1.82f, 0), new Vector3(0.55f, 0.10f, 0.34f), leather);
            seat.transform.SetParent(bike.transform, true);
            var gear = Cylinder("gear disk", new Vector3(-0.25f, 0.78f, -0.035f), new Vector3(0.22f, 0.035f, 0.22f), Quaternion.Euler(90, 0, 0), metal);
            gear.transform.SetParent(bike.transform, true);

            AddDirtToBike(bike.transform);
        }

        void BuildWheel(Transform parent, Vector3 center, float radius, Material tire, Material metal)
        {
            for (int i = 0; i < 32; i++)
            {
                float a = i / 32f * Mathf.PI * 2f;
                Vector3 p = center + new Vector3(Mathf.Cos(a) * radius, Mathf.Sin(a) * radius, 0);
                var seg = Cylinder("tire segment", p, new Vector3(0.055f, 0.13f, 0.055f), Quaternion.Euler(90, 0, -a * Mathf.Rad2Deg), tire);
                seg.transform.SetParent(parent, true);
                if (i % 2 == 0) Rod("spoke", parent, center, p, 0.008f, metal);
            }
            var hub = Cylinder("wheel hub", center, new Vector3(0.08f, 0.08f, 0.08f), Quaternion.Euler(90, 0, 0), metal);
            hub.transform.SetParent(parent, true);
        }

        void Rod(string name, Transform parent, Vector3 a, Vector3 b, float r, Material mat)
        {
            Vector3 mid = (a + b) * 0.5f;
            Vector3 dir = b - a;
            float len = dir.magnitude;
            var o = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            o.name = name;
            o.transform.position = mid;
            o.transform.localScale = new Vector3(r, len * 0.5f, r);
            o.transform.rotation = Quaternion.FromToRotation(Vector3.up, dir.normalized);
            o.GetComponent<Renderer>().material = mat;
            o.transform.SetParent(parent, true);
        }

        void AddDirtToBike(Transform bike)
        {
            var dirtMat = Mat("wet mud", new Color(0.10f, 0.065f, 0.035f, 0.92f), 0.18f);
            var oilMat = Mat("black oil", new Color(0.005f, 0.005f, 0.004f, 0.95f), 0.7f);
            Vector3[] spots = {
                new Vector3(-1.35f,1.2f,-0.08f), new Vector3(1.35f,1.08f,-0.08f), new Vector3(-.25f,.82f,-.11f),
                new Vector3(-.6f,1.36f,-.08f), new Vector3(.42f,1.33f,-.08f), new Vector3(.82f,1.56f,-.1f),
                new Vector3(-1.05f,.62f,-.12f), new Vector3(1.0f,.62f,-.12f)
            };
            for (int i = 0; i < spots.Length; i++)
            {
                var patch = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                patch.name = "cleanable mud patch";
                patch.transform.SetParent(bike, false);
                patch.transform.localPosition = spots[i];
                float s = Random.Range(0.16f, 0.32f);
                patch.transform.localScale = new Vector3(s * 1.45f, s * 0.55f, s * 0.18f);
                patch.GetComponent<Renderer>().material = i == 2 ? oilMat : dirtMat;
                var d = patch.AddComponent<DirtPatch>();
                d.maxHealth = i == 2 ? 3.0f : 1.7f;
                d.health = d.maxHealth;
                DirtPatches.Add(d);
            }
        }

        void BuildPlayer()
        {
            var camObj = new GameObject("FPS Camera");
            var cam = camObj.AddComponent<Camera>();
            cam.fieldOfView = 68;
            cam.nearClipPlane = 0.03f;
            cam.farClipPlane = 80;
            cam.transform.position = new Vector3(0, 1.45f, 3.8f);
            cam.transform.LookAt(new Vector3(0, 1.05f, -1.2f));
            controller = camObj.AddComponent<FirstPersonCleanerController>();
        }

        void BuildUI()
        {
            var canvasObj = new GameObject("HUD");
            var c = canvasObj.AddComponent<Canvas>();
            c.renderMode = RenderMode.ScreenSpaceOverlay;
            canvasObj.AddComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            canvasObj.AddComponent<GraphicRaycaster>();

            var bg = new GameObject("progress bg");
            bg.transform.SetParent(canvasObj.transform);
            var bgi = bg.AddComponent<Image>();
            bgi.color = new Color(0, 0.12f, 0.22f, 0.65f);
            var rt = bg.GetComponent<RectTransform>();
            rt.anchorMin = new Vector2(0, 1); rt.anchorMax = new Vector2(0, 1); rt.pivot = new Vector2(0, 1);
            rt.anchoredPosition = new Vector2(24, -20); rt.sizeDelta = new Vector2(220, 38);

            var fill = new GameObject("progress fill"); fill.transform.SetParent(bg.transform);
            progressFill = fill.AddComponent<Image>(); progressFill.color = new Color(0.30f, 0.90f, 1f, 0.95f); progressFill.type = Image.Type.Filled; progressFill.fillMethod = Image.FillMethod.Horizontal;
            var frt = fill.GetComponent<RectTransform>(); frt.anchorMin = Vector2.zero; frt.anchorMax = Vector2.one; frt.offsetMin = new Vector2(4, 4); frt.offsetMax = new Vector2(-4, -4);

            var txt = new GameObject("progress text"); txt.transform.SetParent(bg.transform);
            progressText = txt.AddComponent<Text>(); progressText.font = Resources.GetBuiltinResource<Font>("Arial.ttf"); progressText.fontSize = 18; progressText.fontStyle = FontStyle.Bold; progressText.color = Color.white; progressText.alignment = TextAnchor.MiddleCenter;
            var trt = txt.GetComponent<RectTransform>(); trt.anchorMin = Vector2.zero; trt.anchorMax = Vector2.one; trt.offsetMin = Vector2.zero; trt.offsetMax = Vector2.zero;
        }
    }
}
