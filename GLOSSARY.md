# Biscotty

These terms describe cookie protection and configuration transfer in Biscotty.

## Language

**Cookie**:
A stored website record with a name, value, domain, and path.
_Avoid_: Browser data, site data.

**Cookie metadata**:
The properties of a cookie, without its value.
_Avoid_: Cookie contents.

**Cookie store**:
A separate collection of cookies within a Firefox profile.
_Avoid_: Jar, account.

**Normal browsing**:
The cookie store used outside named containers and private browsing.
_Avoid_: Global, default container.

**Container**:
A named Firefox browsing context with its own cookie store.
_Avoid_: Profile, account.

**Protected container**:
A container that the cookie burner skips in full.
_Avoid_: Allowed container, container exception.

**Inactive container reference**:
A retained reference to a container that is no longer available.
_Avoid_: Missing account, replacement container.

**Allow rule**:
A cookie protection rule with a domain matcher and a store scope.
_Avoid_: Exception, allow-list item, whitelist entry.

**Allow list**:
The collection of allow rules.
_Avoid_: Whitelist, exclusion list.

**Rule scope**:
The cookie stores to which an allow rule applies.
_Avoid_: Location, target profile.

**All stores**:
A rule scope that includes Normal browsing and every named container.
Private browsing is outside the product scope.
_Avoid_: Global, all profiles.

**Selected stores**:
A rule scope that contains an explicit set of containers, Normal browsing, or both.
_Avoid_: Local rule, global list.

**Cookie domain**:
The domain recorded on a cookie.
_Avoid_: Current site, tab URL.

**Page observation**:
The temporary collection of hosts contacted during one page's lifetime in one tab.
_Avoid_: Browsing history, cookie-use history.

**Observation coverage**:
Whether page observation started with the page load and retained the supported request activity.
Observed coverage does not prove that every stored cookie was used.
_Avoid_: Complete cookie usage, transmission proof.

**Domain snapshot**:
A captured list of cookie domains and associated stored-cookie counts for one page observation and cookie store.
_Avoid_: Live cookie list, request count.

**Base domain**:
A public suffix with the next domain label, as identified by Firefox.
_Avoid_: Root domain, top-level domain.

**Public suffix**:
A domain suffix under which separate parties can register or operate sites.
_Avoid_: Base domain.

**Site protection**:
The effective protection of a site's cookie domains within one cookie store.
_Avoid_: URL permission, login guarantee.

**Effective protection**:
The combined protection from applicable allow rules and whole-container protection.
_Avoid_: Winning rule, override.

**Partition identity**:
The properties that separate cookie storage for different first-party contexts.
_Avoid_: Container, cookie domain.

**Cookie burner**:
The manual action that deletes eligible cookies across the current Firefox profile.
_Avoid_: Cleaner, automatic blocker.

**Burn preview**:
The proposed deletion scope and estimated counts shown before a burn.
_Avoid_: Deletion guarantee, history entry.

**Burn snapshot**:
The bounded collection of cookie metadata selected for one burn preview.
_Avoid_: Backup, live cookie list.

**Eligible cookie**:
A cookie within supported access that has no applicable protection.
A deletion must also pass the safety check.
_Avoid_: Unwanted cookie, expired cookie.

**Ambiguous deletion**:
A deletion request that can affect a protected cookie through Firefox selection rules.
_Avoid_: Safe target, exact deletion.

**Current operation result**:
The temporary result of the current burn, available until dismissal or browser shutdown.
_Avoid_: History, audit log.

**Interruption marker**:
A temporary indication that a burn started but did not finish its state cleanup.
_Avoid_: Run history, cookie backup.

**Configuration file**:
A portable file that contains Biscotty protection settings and container descriptions.
_Avoid_: Cookie export, profile backup.

**Container mapping**:
An explicit association between an imported container reference and a destination reference.
_Avoid_: Automatic match, container creation.

**Import conflict**:
A difference that requires a user decision before imported settings can be applied.
_Avoid_: Validation error, automatic preference.

**Merge**:
An import mode that retains unmatched existing entries and adds unmatched imported entries.
The user resolves conflicting entries.
_Avoid_: Always keep existing, automatic union.

**Replace**:
An import mode that substitutes the confirmed imported configuration for the existing configuration.
_Avoid_: Reset, merge.
