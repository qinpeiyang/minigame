using UnityEngine;
using UnityEngine.EventSystems;

namespace GiantCleaner
{
    public class FirstPersonCleanerController : MonoBehaviour
    {
        public float moveSpeed = 3.2f;
        public float lookSpeed = 0.14f;
        public float cleanPower = 1.4f;
        public float cleanRange = 7f;
        public LayerMask hitMask = ~0;

        private CharacterController cc;
        private Camera cam;
        private float yaw;
        private float pitch;
        private int leftFinger = -1;
        private int rightFinger = -1;
        private Vector2 joyOrigin;
        private Vector2 joyVec;
        private Vector2 lastLook;
        private bool spraying;
        private ParticleSystem waterFx;
        private Transform gun;

        void Start()
        {
            cam = GetComponent<Camera>();
            cc = gameObject.AddComponent<CharacterController>();
            cc.height = 1.75f;
            cc.radius = 0.32f;
            cc.center = new Vector3(0, -0.25f, 0);
            yaw = transform.eulerAngles.y;
            pitch = transform.eulerAngles.x;
            BuildGun();
            BuildWaterFx();
        }

        void BuildGun()
        {
            var root = new GameObject("First Person Pressure Washer");
            root.transform.SetParent(cam.transform);
            root.transform.localPosition = new Vector3(0.55f, -0.42f, 0.78f);
            root.transform.localRotation = Quaternion.Euler(4, -8, 0);
            gun = root.transform;

            Material metal = new Material(Shader.Find("Standard"));
            metal.color = new Color(0.78f, 0.84f, 0.88f);
            metal.SetFloat("_Glossiness", 0.75f);
            Material dark = new Material(Shader.Find("Standard"));
            dark.color = new Color(0.05f, 0.07f, 0.08f);
            Material blue = new Material(Shader.Find("Standard"));
            blue.color = new Color(0.1f, 0.65f, 1f);

            Box(root.transform, "washer body", new Vector3(0, 0, 0), new Vector3(0.55f, 0.24f, 0.26f), metal);
            Box(root.transform, "washer handle", new Vector3(-0.06f, -0.28f, 0.02f), new Vector3(0.16f, 0.48f, 0.14f), dark);
            Box(root.transform, "blue pressure tank", new Vector3(0.08f, 0.17f, 0), new Vector3(0.32f, 0.12f, 0.20f), blue);
            Box(root.transform, "long nozzle", new Vector3(0, 0.02f, 0.56f), new Vector3(0.08f, 0.08f, 0.92f), metal);
        }

        void Box(Transform parent, string name, Vector3 localPos, Vector3 scale, Material mat)
        {
            var o = GameObject.CreatePrimitive(PrimitiveType.Cube);
            o.name = name;
            o.transform.SetParent(parent, false);
            o.transform.localPosition = localPos;
            o.transform.localScale = scale;
            o.GetComponent<Renderer>().material = mat;
            Destroy(o.GetComponent<Collider>());
        }

        void BuildWaterFx()
        {
            var go = new GameObject("high pressure water particles");
            go.transform.SetParent(gun);
            go.transform.localPosition = new Vector3(0, 0.02f, 1.08f);
            go.transform.localRotation = Quaternion.identity;
            waterFx = go.AddComponent<ParticleSystem>();
            var main = waterFx.main;
            main.startLifetime = 0.35f;
            main.startSpeed = 18f;
            main.startSize = 0.035f;
            main.maxParticles = 900;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.startColor = new Color(0.75f, 0.95f, 1f, 0.78f);
            var em = waterFx.emission;
            em.rateOverTime = 0;
            var shape = waterFx.shape;
            shape.shapeType = ParticleSystemShapeType.Cone;
            shape.angle = 4f;
            shape.radius = 0.025f;
            waterFx.Stop();
        }

        void Update()
        {
            HandleInput();
            Move();
            Spray();
        }

        void HandleInput()
        {
#if UNITY_EDITOR || UNITY_STANDALONE
            if (Input.GetMouseButtonDown(0)) { rightFinger = 999; lastLook = Input.mousePosition; spraying = true; }
            if (Input.GetMouseButton(0))
            {
                Vector2 p = Input.mousePosition;
                Vector2 d = p - lastLook;
                yaw += d.x * lookSpeed;
                pitch = Mathf.Clamp(pitch - d.y * lookSpeed, -55, 55);
                lastLook = p;
            }
            if (Input.GetMouseButtonUp(0)) { rightFinger = -1; spraying = false; }
            joyVec = new Vector2(Input.GetAxis("Horizontal"), Input.GetAxis("Vertical"));
#else
            for (int i = 0; i < Input.touchCount; i++)
            {
                Touch t = Input.GetTouch(i);
                Vector2 p = t.position;
                if (t.phase == TouchPhase.Began)
                {
                    if (p.x < Screen.width * 0.38f && leftFinger < 0)
                    {
                        leftFinger = t.fingerId;
                        joyOrigin = p;
                        joyVec = Vector2.zero;
                    }
                    else if (rightFinger < 0)
                    {
                        rightFinger = t.fingerId;
                        lastLook = p;
                        spraying = true;
                    }
                }
                else if (t.fingerId == leftFinger)
                {
                    if (t.phase == TouchPhase.Ended || t.phase == TouchPhase.Canceled)
                    {
                        leftFinger = -1;
                        joyVec = Vector2.zero;
                    }
                    else
                    {
                        joyVec = Vector2.ClampMagnitude((p - joyOrigin) / 90f, 1f);
                    }
                }
                else if (t.fingerId == rightFinger)
                {
                    if (t.phase == TouchPhase.Ended || t.phase == TouchPhase.Canceled)
                    {
                        rightFinger = -1;
                        spraying = false;
                    }
                    else
                    {
                        Vector2 d = p - lastLook;
                        yaw += d.x * lookSpeed;
                        pitch = Mathf.Clamp(pitch - d.y * lookSpeed, -55, 55);
                        lastLook = p;
                    }
                }
            }
#endif
            transform.rotation = Quaternion.Euler(pitch, yaw, 0);
        }

        void Move()
        {
            Vector3 forward = transform.forward; forward.y = 0; forward.Normalize();
            Vector3 right = transform.right; right.y = 0; right.Normalize();
            Vector3 move = (right * joyVec.x + forward * joyVec.y) * moveSpeed;
            move.y = -4f;
            cc.Move(move * Time.deltaTime);
        }

        void Spray()
        {
            var em = waterFx.emission;
            em.rateOverTime = spraying ? 650 : 0;

            if (!spraying) return;
            Ray ray = new Ray(cam.transform.position, cam.transform.forward);
            if (Physics.Raycast(ray, out RaycastHit hit, cleanRange, hitMask, QueryTriggerInteraction.Collide))
            {
                DirtPatch patch = hit.collider.GetComponent<DirtPatch>();
                if (patch) patch.Clean(cleanPower * Time.deltaTime);

                Collider[] nearby = Physics.OverlapSphere(hit.point, 0.42f);
                foreach (var c in nearby)
                {
                    var d = c.GetComponent<DirtPatch>();
                    if (d) d.Clean(cleanPower * 0.55f * Time.deltaTime);
                }
            }
        }
    }
}
