using UnityEngine;

namespace GiantCleaner
{
    public class DirtPatch : MonoBehaviour
    {
        public float maxHealth = 1f;
        public float health = 1f;
        private Renderer rend;
        private Color baseColor;

        void Awake()
        {
            rend = GetComponent<Renderer>();
            if (rend) baseColor = rend.material.color;
        }

        public void Clean(float amount)
        {
            if (health <= 0) return;
            health = Mathf.Max(0, health - amount);
            float a = maxHealth <= 0 ? 0 : health / maxHealth;
            if (rend)
            {
                var c = baseColor;
                c.a = Mathf.Lerp(0f, baseColor.a, a);
                rend.material.color = c;
            }
            transform.localScale *= Mathf.Lerp(0.992f, 0.999f, a);
            if (health <= 0.001f) gameObject.SetActive(false);
        }
    }
}
