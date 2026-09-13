# Retired spear experiments

The player reported that 1.1.6 had sound but no first-person brandishing, and
1.1.7 did not render the spear. The old geometry, pose generators and their
implementation-specific tests are retained here, not executed or shipped.
Those tests described the abandoned implementation; passing them never proved
Bedrock rendered or animated it. Current regression tests assert the recovery
render path and the independent diagnostic pack instead.
