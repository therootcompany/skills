---
name: bnna-add-network-opnsense
description: Document steps for adding a firewall rule/network in OPNsense/pfSense.
---

# bnna-add-network-opnsense
**Skill purpose:** Document step‑by‑step instructions for adding a network firewall rule in the OPNsense web UI.
## Prerequisites
- Administrator login to the OPNsense web interface.
- Access to the console or SSH to monitor progress.
- The target VLAN id (e.g., **174**) and network address block (e.g., **172.24.0.0/24**).
## Procedure
1. **Navigate to Interfaces → Other Types**
   1.1. Click *Add*.
   1.2. For **Parent Interface**, select **vnet2** (typically maps to `vmbr0` and is VLAN‑aware).
2. **Configure the Interface**
   2.1. **Name**: `vtnet2_vlan174`.
   2.2. **VLAN Tag**: `174`.
   2.3. **Description**: `GSrv_172_24` (leave unchanged).
   2.4. **Apply Configuration** (MUST be clicked!) • Wait until the system finishes applying changes.
3. **Assign the Interface**
   3.1. Go back to **Interfaces → Assignments**.
   3.2. Click the *Add* (+) button.
   3.3. For **Interface**, choose `vtnet2_vlan174`.
   3.4. **Description**: `Global_Srv_172_24` (must NOT change).
   3.5. Verify that the status indicator is **Green**; it should not flash **Red**. (Skip Apply if already green.)
   3.6. Click **Save**.
4. **Enable Static IP**
   4.1. Return to **Interfaces → Global_Srv_172_24**.
   4.2. Ensure the **Enable Interface** checkbox is ticked.
   4.3. Set **Prevent Removal**.
   4.4. Under **Static IPv4**, provide `172.24.0.1/24`.
   4.5. Click **Save**.
   4.6. Click **Apply** to commit the new IP configuration.
5. **Create Floating Firewall Rule**
   5.1. Navigate to **Firewall → Rules → Floating**.
   5.2. Click **Clone** next to an existing Global Services rule (usually the one for `Global_Srv_172_2`).
   5.3. In the clone, set the **Destination** to `Global_Srv_172_2 net` (note: select the network, not a single address).
   5.4. Click **Save**.
   5.5. Click **Apply** to activate the floating rule.
## Verification
- Confirm the interface appears in **Interfaces → Assignments** as *UP*.
- Run `ifconfig vtnet2_vlan174` or `ip addr show vtnet2_vlan174` on the host to see `172.24.0.1/24`.
- Verify the floating rule is listed in **Firewall → Rules → Floating** and is active.
## Notes
- The `Apply` step is crucial: without it, changes are only staged.
- Keep the VLAN ID and IP block consistent across all configuration steps.
- Always double‑check that the description strings match exactly; typos can break the rule associations.
