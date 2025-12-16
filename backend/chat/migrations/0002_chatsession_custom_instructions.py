from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ("chat", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="chatsession",
            name="custom_instructions",
            field=models.TextField(blank=True, default=""),
        ),
    ]