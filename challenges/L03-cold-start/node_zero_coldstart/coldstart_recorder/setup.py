from setuptools import setup

package_name = 'coldstart_recorder'

setup(
    name=package_name,
    version='7.0.0',
    # BUG (intentional, Stage 3): `pkg_name` is not defined -- the variable
    # above is `package_name`. `colcon build` fails here with a NameError that
    # names this file and line. Fix the reference and the recorder builds.
    packages=[pkg_name],
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='IEEE RAS NODE ZERO',
    maintainer_email='nodezero@ieeeras.example',
    description='NODE ZERO Stage 3: Unit Zero flight recorder -- rebuild it and recover the boot log.',
    license='MIT',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'coldstart_node = coldstart_recorder.coldstart_node:main',
        ],
    },
)
